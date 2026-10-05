"""Billing operations. Every function that moves money runs in one transaction
and writes the matching ledger entries, so invoice totals and the ledger never drift apart."""

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.clinic.models import ClinicSettings, Sequence

from .models import ZERO, Invoice, InvoiceItem, LedgerEntry, Payment, Refund

CENT = Decimal("0.01")
HUNDRED = Decimal("100")


def q(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


def rupees(value):
    return f"₹{value:,.2f}"


def compute_line(quantity, unit_price, discount_type, discount_value, tax_rate):
    """Prices are tax-exclusive: discount applies first, GST is charged on the discounted amount."""
    gross = q(quantity * unit_price)
    if discount_type == InvoiceItem.DiscountType.PERCENT:
        discount = q(gross * discount_value / HUNDRED)
    else:
        discount = q(discount_value)
    discount = min(discount, gross)
    taxable = gross - discount
    tax = q(taxable * tax_rate / HUNDRED)
    return {
        "gross": gross,
        "discount_amount": discount,
        "taxable_amount": taxable,
        "tax_amount": tax,
        "line_total": taxable + tax,
    }


def _document_number(kind, when):
    prefix = ClinicSettings.load().invoice_prefix
    year = timezone.localtime(when).year
    n = Sequence.next_value(kind, year)
    label = {"invoice": "", "receipt": "R-", "refund": "RF-"}[kind]
    return f"{prefix}-{label}{year}-{n:04d}"


@transaction.atomic
def create_invoice(*, patient, doctor, invoice_date, items, notes, user, payment=None):
    if not items:
        raise ValidationError({"items": "Add at least one item to the invoice."})
    invoice_date = invoice_date or timezone.now()
    clinic = ClinicSettings.load()

    invoice = Invoice(
        number=_document_number("invoice", invoice_date),
        patient=patient, doctor=doctor, invoice_date=invoice_date, notes=notes, created_by=user,
    )
    subtotal = discount_total = taxable_total = tax_total = ZERO
    lines = []
    for position, data in enumerate(items):
        calc = compute_line(
            data["quantity"], data["unit_price"], data["discount_type"], data["discount_value"], data["tax_rate"]
        )
        subtotal += calc["gross"]
        discount_total += calc["discount_amount"]
        taxable_total += calc["taxable_amount"]
        tax_total += calc["tax_amount"]
        service = data.get("service")
        lines.append(InvoiceItem(
            service=service,
            description=data["description"],
            category=data.get("category") or (service.category if service else "OTHER"),
            details=data.get("details", ""),
            code=data.get("code") or (service.code if service else ""),
            quantity=data["quantity"],
            unit_price=data["unit_price"],
            discount_type=data["discount_type"],
            discount_value=data["discount_value"],
            tax_rate=data["tax_rate"],
            position=position,
            discount_amount=calc["discount_amount"],
            taxable_amount=calc["taxable_amount"],
            tax_amount=calc["tax_amount"],
            line_total=calc["line_total"],
        ))

    exact_total = taxable_total + tax_total
    total = exact_total.quantize(Decimal("1"), rounding=ROUND_HALF_UP) if clinic.round_off_total else exact_total
    invoice.subtotal, invoice.discount_total = subtotal, discount_total
    invoice.taxable_total, invoice.tax_total = taxable_total, tax_total
    invoice.round_off, invoice.total = q(total - exact_total), q(total)
    invoice.save()
    for line in lines:
        line.invoice = invoice
    InvoiceItem.objects.bulk_create(lines)

    LedgerEntry.objects.create(
        patient=patient, entry_type=LedgerEntry.EntryType.INVOICE, debit=invoice.total, invoice=invoice,
        narration=f"Invoice {invoice.number}", created_by=user,
    )
    if payment and payment.get("amount") and payment["amount"] > 0:
        record_payment(invoice=invoice, user=user, **payment)
        invoice.refresh_from_db()
    return invoice


def _lock(invoice):
    return Invoice.objects.select_for_update().get(pk=invoice.pk)


@transaction.atomic
def record_payment(*, invoice, amount, mode, user, reference="", notes="", paid_at=None):
    invoice = _lock(invoice)
    amount = q(amount)
    if invoice.status == Invoice.Status.CANCELLED:
        raise ValidationError({"amount": "This invoice is cancelled and cannot accept payments."})
    if amount <= 0:
        raise ValidationError({"amount": "Enter an amount greater than zero."})
    if amount > invoice.balance_due:
        raise ValidationError({"amount": f"Amount is more than the balance due ({rupees(invoice.balance_due)})."})

    paid_at = paid_at or timezone.now()
    pay = Payment.objects.create(
        receipt_number=_document_number("receipt", paid_at), invoice=invoice, patient=invoice.patient,
        amount=amount, mode=mode, reference=reference, notes=notes, paid_at=paid_at, received_by=user,
    )
    invoice.amount_paid += amount
    invoice.save(update_fields=["amount_paid"])
    LedgerEntry.objects.create(
        patient=invoice.patient, entry_type=LedgerEntry.EntryType.PAYMENT, credit=amount, invoice=invoice,
        payment=pay, narration=f"{pay.get_mode_display()} payment {pay.receipt_number}", created_by=user,
    )
    return pay


@transaction.atomic
def record_refund(*, invoice, amount, mode, reason, user, reference="", cancel_invoice=False):
    invoice = _lock(invoice)
    amount = q(amount)
    if not reason.strip():
        raise ValidationError({"reason": "Please give a reason for the refund."})
    if amount <= 0:
        raise ValidationError({"amount": "Enter an amount greater than zero."})
    if amount > invoice.refundable_amount:
        raise ValidationError({"amount": f"You can refund at most {rupees(invoice.refundable_amount)} on this invoice."})

    now = timezone.now()
    refund = Refund.objects.create(
        refund_number=_document_number("refund", now), invoice=invoice, patient=invoice.patient, amount=amount,
        mode=mode, reference=reference, reason=reason.strip(), refunded_at=now, created_by=user,
    )
    invoice.amount_refunded += amount
    invoice.save(update_fields=["amount_refunded"])
    # A refund is a credit note (reduces what was billed) plus the money paid back to the patient.
    LedgerEntry.objects.create(
        patient=invoice.patient, entry_type=LedgerEntry.EntryType.CREDIT_NOTE, credit=amount, invoice=invoice,
        refund=refund, narration=f"Credit note against {invoice.number}", created_by=user,
    )
    LedgerEntry.objects.create(
        patient=invoice.patient, entry_type=LedgerEntry.EntryType.REFUND, debit=amount, invoice=invoice,
        refund=refund, narration=f"{refund.get_mode_display()} refund {refund.refund_number}", created_by=user,
    )
    if cancel_invoice:
        cancel(invoice=invoice, reason=reason, user=user)
    return refund


@transaction.atomic
def cancel(*, invoice, reason, user):
    invoice = _lock(invoice)
    if invoice.status == Invoice.Status.CANCELLED:
        raise ValidationError({"detail": "This invoice is already cancelled."})
    if not reason.strip():
        raise ValidationError({"reason": "Please give a reason for cancelling."})
    if invoice.refundable_amount > 0:
        raise ValidationError({
            "detail": f"{rupees(invoice.refundable_amount)} has been collected on this invoice. "
                      "Refund it before cancelling."
        })
    invoice.status = Invoice.Status.CANCELLED
    invoice.cancel_reason = reason.strip()
    invoice.cancelled_at = timezone.now()
    invoice.cancelled_by = user
    invoice.save(update_fields=["status", "cancel_reason", "cancelled_at", "cancelled_by"])
    LedgerEntry.objects.create(
        patient=invoice.patient, entry_type=LedgerEntry.EntryType.CANCELLATION,
        credit=invoice.total - invoice.amount_refunded, invoice=invoice,
        narration=f"Invoice {invoice.number} cancelled", created_by=user,
    )
    return invoice
