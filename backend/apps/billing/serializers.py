from decimal import Decimal

from rest_framework import serializers

from apps.catalog.models import Service
from apps.clinic.models import Doctor
from apps.clinic.serializers import DoctorSerializer
from apps.patients.models import Patient
from apps.patients.serializers import PatientSerializer

from .models import Invoice, InvoiceItem, LedgerEntry, Payment, PaymentMode, Refund

MONEY = {"max_digits": 12, "decimal_places": 2}


class InvoiceItemSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = InvoiceItem
        fields = [
            "id", "service", "description", "category", "category_label", "details", "code", "quantity",
            "unit_price", "discount_type", "discount_value", "discount_amount", "taxable_amount", "tax_rate",
            "tax_amount", "line_total",
        ]


class PaymentSerializer(serializers.ModelSerializer):
    mode_label = serializers.CharField(source="get_mode_display", read_only=True)
    invoice_number = serializers.CharField(source="invoice.number", read_only=True)
    patient_name = serializers.CharField(source="patient.name", read_only=True)
    patient_uhid = serializers.CharField(source="patient.uhid", read_only=True)
    received_by_name = serializers.CharField(source="received_by.display_name", read_only=True, default="")

    class Meta:
        model = Payment
        fields = [
            "id", "receipt_number", "invoice", "invoice_number", "patient", "patient_name", "patient_uhid",
            "amount", "mode", "mode_label", "reference", "notes", "paid_at", "received_by_name",
        ]


class RefundSerializer(serializers.ModelSerializer):
    mode_label = serializers.CharField(source="get_mode_display", read_only=True)
    invoice_number = serializers.CharField(source="invoice.number", read_only=True)
    patient_name = serializers.CharField(source="patient.name", read_only=True)
    patient_uhid = serializers.CharField(source="patient.uhid", read_only=True)
    created_by_name = serializers.CharField(source="created_by.display_name", read_only=True, default="")

    class Meta:
        model = Refund
        fields = [
            "id", "refund_number", "invoice", "invoice_number", "patient", "patient_name", "patient_uhid",
            "amount", "mode", "mode_label", "reference", "reason", "refunded_at", "created_by_name",
        ]


class LedgerEntrySerializer(serializers.ModelSerializer):
    entry_type_label = serializers.CharField(source="get_entry_type_display", read_only=True)

    class Meta:
        model = LedgerEntry
        fields = ["id", "entry_type", "entry_type_label", "debit", "credit", "narration", "created_at"]


class InvoiceListSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.name", read_only=True)
    patient_uhid = serializers.CharField(source="patient.uhid", read_only=True)
    patient_phone = serializers.CharField(source="patient.phone", read_only=True)
    doctor_name = serializers.CharField(source="doctor.name", read_only=True, default="")
    balance_due = serializers.DecimalField(read_only=True, **MONEY)
    payment_status = serializers.CharField(read_only=True)
    item_summary = serializers.SerializerMethodField()

    class Meta:
        model = Invoice
        fields = [
            "id", "number", "invoice_date", "status", "payment_status", "patient", "patient_name", "patient_uhid",
            "patient_phone", "doctor_name", "total", "amount_paid", "amount_refunded", "balance_due", "item_summary",
        ]

    def get_item_summary(self, obj):
        names = [i.description for i in obj.items.all()]
        if not names:
            return ""
        return names[0] if len(names) == 1 else f"{names[0]} + {len(names) - 1} more"


class InvoiceDetailSerializer(InvoiceListSerializer):
    patient_detail = PatientSerializer(source="patient", read_only=True)
    doctor_detail = DoctorSerializer(source="doctor", read_only=True)
    items = InvoiceItemSerializer(many=True, read_only=True)
    payments = PaymentSerializer(many=True, read_only=True)
    refunds = RefundSerializer(many=True, read_only=True)
    refundable_amount = serializers.DecimalField(read_only=True, **MONEY)
    created_by_name = serializers.CharField(source="created_by.display_name", read_only=True, default="")
    cancelled_by_name = serializers.CharField(source="cancelled_by.display_name", read_only=True, default="")

    class Meta(InvoiceListSerializer.Meta):
        fields = InvoiceListSerializer.Meta.fields + [
            "patient_detail", "doctor", "doctor_detail", "items", "payments", "refunds", "subtotal",
            "discount_total", "taxable_total", "tax_total", "round_off", "refundable_amount", "notes",
            "cancel_reason", "cancelled_at", "cancelled_by_name", "created_by_name", "created_at",
        ]


# ---- Input serializers ----

class NewItemSerializer(serializers.Serializer):
    service = serializers.PrimaryKeyRelatedField(queryset=Service.objects.all(), required=False, allow_null=True)
    description = serializers.CharField(max_length=200)
    category = serializers.ChoiceField(choices=Service.Category.choices, required=False)
    details = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    quantity = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0.01"))
    unit_price = serializers.DecimalField(min_value=Decimal("0"), **MONEY)
    discount_type = serializers.ChoiceField(choices=InvoiceItem.DiscountType.choices, default="AMOUNT")
    discount_value = serializers.DecimalField(min_value=Decimal("0"), default=Decimal("0"), **MONEY)
    tax_rate = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal("0"), max_value=Decimal("28"), default=Decimal("0")
    )

    def validate(self, data):
        if data["discount_type"] == "PERCENT" and data["discount_value"] > 100:
            raise serializers.ValidationError({"discount_value": "Discount cannot be more than 100%."})
        if data["discount_type"] == "AMOUNT" and data["discount_value"] > data["quantity"] * data["unit_price"]:
            raise serializers.ValidationError({"discount_value": "Discount cannot be more than the item amount."})
        return data


class PaymentInputSerializer(serializers.Serializer):
    amount = serializers.DecimalField(min_value=Decimal("0"), **MONEY)
    mode = serializers.ChoiceField(choices=PaymentMode.choices)
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    notes = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    paid_at = serializers.DateTimeField(required=False, allow_null=True)


class NewInvoiceSerializer(serializers.Serializer):
    patient = serializers.PrimaryKeyRelatedField(queryset=Patient.objects.all())
    doctor = serializers.PrimaryKeyRelatedField(queryset=Doctor.objects.all(), required=False, allow_null=True)
    invoice_date = serializers.DateTimeField(required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    items = NewItemSerializer(many=True)
    payment = PaymentInputSerializer(required=False, allow_null=True)


class RefundInputSerializer(serializers.Serializer):
    amount = serializers.DecimalField(min_value=Decimal("0.01"), **MONEY)
    mode = serializers.ChoiceField(choices=PaymentMode.choices)
    reference = serializers.CharField(max_length=100, required=False, allow_blank=True, default="")
    reason = serializers.CharField()
    cancel_invoice = serializers.BooleanField(default=False)


class CancelInputSerializer(serializers.Serializer):
    reason = serializers.CharField()
