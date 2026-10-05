from django.contrib import admin

from .models import Invoice, InvoiceItem, LedgerEntry, Payment, Refund


class ReadOnlyAdmin(admin.ModelAdmin):
    """Billing records change only through the app's billing actions, never by editing here."""

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class InvoiceItemInline(admin.TabularInline):
    model = InvoiceItem
    extra = 0
    can_delete = False

    def has_change_permission(self, request, obj=None):
        return False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Invoice)
class InvoiceAdmin(ReadOnlyAdmin):
    list_display = ("number", "invoice_date", "patient", "total", "amount_paid", "status")
    search_fields = ("number", "patient__name", "patient__phone")
    list_filter = ("status",)
    inlines = [InvoiceItemInline]


@admin.register(Payment)
class PaymentAdmin(ReadOnlyAdmin):
    list_display = ("receipt_number", "paid_at", "patient", "amount", "mode")


@admin.register(Refund)
class RefundAdmin(ReadOnlyAdmin):
    list_display = ("refund_number", "refunded_at", "patient", "amount", "mode")


@admin.register(LedgerEntry)
class LedgerEntryAdmin(ReadOnlyAdmin):
    list_display = ("created_at", "patient", "entry_type", "debit", "credit", "narration")
    list_filter = ("entry_type",)
