from decimal import Decimal

from django.db import IntegrityError, connection, transaction
from django.db.models import Sum
from django.test import TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing import services
from apps.billing.models import LedgerEntry
from apps.billing.pdf import amount_in_words, inr, render_invoice_pdf
from apps.clinic.models import Doctor
from apps.patients.models import Patient

D = Decimal


def item(price, qty=1, tax=0, disc=0, disc_type="AMOUNT", name="Item"):
    return {"description": name, "quantity": D(qty), "unit_price": D(price), "discount_type": disc_type,
            "discount_value": D(disc), "tax_rate": D(tax), "details": ""}


def ledger_balance(patient):
    agg = LedgerEntry.objects.filter(patient=patient).aggregate(d=Sum("debit"), c=Sum("credit"))
    return (agg["d"] or 0) - (agg["c"] or 0)


class BillingServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user("desk", password="x", role=User.Role.FRONT_DESK)
        self.doctor = Doctor.objects.create(name="Dr. Test", is_default=True)
        self.patient = Patient.objects.create(name="Test Patient", phone="9876543210")

    def make(self, items, payment=None):
        return services.create_invoice(patient=self.patient, doctor=self.doctor, invoice_date=None,
                                       items=items, notes="", user=self.user, payment=payment)

    def test_totals_discount_tax_and_round_off(self):
        inv = self.make([item(2500, tax=18, disc=10, disc_type="PERCENT"), item(650.50, qty=2)])
        # 2500 - 250 = 2250 + 405 GST = 2655 ; 1301.00 ; total 3956.00
        self.assertEqual(inv.subtotal, D("3801.00"))
        self.assertEqual(inv.discount_total, D("250.00"))
        self.assertEqual(inv.tax_total, D("405.00"))
        self.assertEqual(inv.total, D("3956.00"))
        self.assertTrue(inv.number.endswith("-0001"))
        self.assertEqual(inv.payment_status, "PENDING")
        self.assertEqual(ledger_balance(self.patient), D("3956.00"))

    def test_round_off_to_rupee(self):
        inv = self.make([item("99.60")])
        self.assertEqual(inv.total, D("100.00"))
        self.assertEqual(inv.round_off, D("0.40"))

    def test_payment_with_invoice_and_overpayment_rejected(self):
        inv = self.make([item(1000)], payment={"amount": D(400), "mode": "UPI", "reference": "UTR1"})
        self.assertEqual(inv.amount_paid, D("400.00"))
        self.assertEqual(inv.payment_status, "PARTIAL")
        with self.assertRaises(ValidationError):
            services.record_payment(invoice=inv, amount=D(601), mode="CASH", user=self.user)
        services.record_payment(invoice=inv, amount=D(600), mode="CASH", user=self.user)
        inv.refresh_from_db()
        self.assertEqual(inv.payment_status, "PAID")
        self.assertEqual(ledger_balance(self.patient), 0)

    def test_refund_then_cancel_leaves_ledger_at_zero(self):
        inv = self.make([item(1000)], payment={"amount": D(400), "mode": "CASH"})
        with self.assertRaises(ValidationError):
            services.cancel(invoice=inv, reason="Changed mind", user=self.user)
        services.record_refund(invoice=inv, amount=D(400), mode="CASH", reason="Changed mind",
                               user=self.user, cancel_invoice=True)
        inv.refresh_from_db()
        self.assertEqual(inv.status, "CANCELLED")
        self.assertEqual(inv.balance_due, 0)
        self.assertEqual(ledger_balance(self.patient), 0)

    def test_partial_refund_cannot_exceed_collected(self):
        inv = self.make([item(1000)], payment={"amount": D(1000), "mode": "CARD"})
        services.record_refund(invoice=inv, amount=D(300), mode="CASH", reason="Product returned", user=self.user)
        with self.assertRaises(ValidationError):
            services.record_refund(invoice=inv, amount=D(701), mode="CASH", reason="x", user=self.user)
        inv.refresh_from_db()
        self.assertEqual(inv.payment_status, "PAID")
        self.assertEqual(ledger_balance(self.patient), 0)

    def test_ledger_rows_are_append_only_in_database(self):
        self.make([item(500)])
        entry = LedgerEntry.objects.first()
        with self.assertRaises(Exception):
            entry.save()
        with self.assertRaises(Exception), transaction.atomic(), connection.cursor() as cur:
            cur.execute("UPDATE billing_ledgerentry SET debit = 0")
        with self.assertRaises(Exception), transaction.atomic(), connection.cursor() as cur:
            cur.execute("DELETE FROM billing_ledgerentry")

    def test_pdf_renders(self):
        inv = self.make([item(2500, tax=18)], payment={"amount": D(1000), "mode": "UPI"})
        self.assertTrue(render_invoice_pdf(inv).startswith(b"%PDF"))


class FormattingTests(TestCase):
    def test_indian_grouping_and_words(self):
        self.assertEqual(inr(D("1234567.5")), "₹12,34,567.50")
        self.assertEqual(inr(D("950")), "₹950.00")
        self.assertEqual(amount_in_words(D("3956")), "Rupees Three Thousand Nine Hundred Fifty Six Only")
        self.assertEqual(amount_in_words(D("125000.50")), "Rupees One Lakh Twenty Five Thousand and Fifty Paise Only")


class PermissionTests(TestCase):
    def test_front_desk_cannot_refund(self):
        desk = User.objects.create_user("desk", password="x", role=User.Role.FRONT_DESK)
        patient = Patient.objects.create(name="P Q", phone="9876543210")
        inv = services.create_invoice(patient=patient, doctor=None, invoice_date=None, items=[item(100)],
                                      notes="", user=desk, payment={"amount": D(100), "mode": "CASH"})
        client = APIClient()
        client.force_authenticate(desk)
        r = client.post(f"/api/invoices/{inv.pk}/refund/", {"amount": "10", "mode": "CASH", "reason": "x"}, format="json")
        self.assertEqual(r.status_code, 403)
