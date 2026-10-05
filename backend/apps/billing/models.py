from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.catalog.models import Service
from apps.clinic.models import Doctor
from apps.patients.models import Patient

ZERO = Decimal("0.00")


def money_field(**kwargs):
    return models.DecimalField(max_digits=12, decimal_places=2, default=ZERO, **kwargs)


class PaymentMode(models.TextChoices):
    CASH = "CASH", "Cash"
    UPI = "UPI", "UPI"
    CARD = "CARD", "Card"
    BANK_TRANSFER = "BANK_TRANSFER", "Bank transfer"
    OTHER = "OTHER", "Other"


class Invoice(models.Model):
    """A finalized bill. Never edited once created; corrections happen through refunds or cancellation."""

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        CANCELLED = "CANCELLED", "Cancelled"

    number = models.CharField(max_length=30, unique=True)
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="invoices")
    doctor = models.ForeignKey(Doctor, null=True, blank=True, on_delete=models.PROTECT, related_name="invoices")
    invoice_date = models.DateTimeField(default=timezone.now, db_index=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.ACTIVE)

    subtotal = money_field()  # quantity x price, before discount
    discount_total = money_field()
    taxable_total = money_field()
    tax_total = money_field()
    round_off = money_field()
    total = money_field()
    amount_paid = money_field()
    amount_refunded = money_field()

    notes = models.TextField(blank=True)
    cancel_reason = models.TextField(blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-invoice_date", "-id"]

    @property
    def balance_due(self):
        if self.status == self.Status.CANCELLED:
            return ZERO
        return max(self.total - self.amount_paid, ZERO)

    @property
    def refundable_amount(self):
        return self.amount_paid - self.amount_refunded

    @property
    def payment_status(self):
        if self.status == self.Status.CANCELLED:
            return "CANCELLED"
        if self.amount_paid >= self.total:
            return "PAID"
        if self.amount_paid > 0:
            return "PARTIAL"
        return "PENDING"

    def __str__(self):
        return self.number


class InvoiceItem(models.Model):
    class DiscountType(models.TextChoices):
        AMOUNT = "AMOUNT", "₹"
        PERCENT = "PERCENT", "%"

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name="items")
    service = models.ForeignKey(Service, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    description = models.CharField(max_length=200)
    category = models.CharField(max_length=20, choices=Service.Category.choices, default=Service.Category.OTHER)
    details = models.CharField(max_length=255, blank=True, help_text="Session details, area treated, batch etc.")
    code = models.CharField(max_length=20, blank=True)
    quantity = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal("1"))
    unit_price = money_field()
    discount_type = models.CharField(max_length=10, choices=DiscountType.choices, default=DiscountType.AMOUNT)
    discount_value = money_field()
    discount_amount = money_field()
    taxable_amount = money_field()
    tax_rate = models.DecimalField(max_digits=5, decimal_places=2, default=ZERO)
    tax_amount = money_field()
    line_total = money_field()
    position = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]


class Payment(models.Model):
    receipt_number = models.CharField(max_length=30, unique=True)
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="payments")
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="payments")
    amount = money_field()
    mode = models.CharField(max_length=20, choices=PaymentMode.choices)
    reference = models.CharField(max_length=100, blank=True)
    notes = models.CharField(max_length=255, blank=True)
    paid_at = models.DateTimeField(default=timezone.now, db_index=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-paid_at", "-id"]


class Refund(models.Model):
    refund_number = models.CharField(max_length=30, unique=True)
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="refunds")
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="refunds")
    amount = money_field()
    mode = models.CharField(max_length=20, choices=PaymentMode.choices)
    reference = models.CharField(max_length=100, blank=True)
    reason = models.TextField()
    refunded_at = models.DateTimeField(default=timezone.now, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-refunded_at", "-id"]


class LedgerEntry(models.Model):
    """Append-only record of every money movement for a patient.

    Balance = sum(debit) - sum(credit). Positive means the patient owes the clinic.
    Rows are never updated or deleted; mistakes are corrected with new entries.
    """

    class EntryType(models.TextChoices):
        INVOICE = "INVOICE", "Invoice"
        PAYMENT = "PAYMENT", "Payment received"
        CREDIT_NOTE = "CREDIT_NOTE", "Credit note"
        REFUND = "REFUND", "Refund paid"
        CANCELLATION = "CANCELLATION", "Invoice cancelled"

    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="ledger_entries")
    entry_type = models.CharField(max_length=20, choices=EntryType.choices)
    debit = money_field()
    credit = money_field()
    invoice = models.ForeignKey(Invoice, null=True, blank=True, on_delete=models.PROTECT, related_name="ledger_entries")
    payment = models.ForeignKey(Payment, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    refund = models.ForeignKey(Refund, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    narration = models.CharField(max_length=255)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["created_at", "id"]
        verbose_name_plural = "ledger entries"

    def save(self, *args, **kwargs):
        if self.pk:
            raise ValidationError("Ledger entries cannot be changed.")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Ledger entries cannot be deleted.")
