from datetime import datetime, time

from django.db.models import F, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.permissions import CanManage

from . import services
from .models import Invoice, LedgerEntry, Payment, Refund
from .pdf import render_invoice_pdf, render_receipt_pdf
from .serializers import (
    CancelInputSerializer,
    InvoiceDetailSerializer,
    InvoiceListSerializer,
    LedgerEntrySerializer,
    NewInvoiceSerializer,
    PaymentInputSerializer,
    PaymentSerializer,
    RefundInputSerializer,
    RefundSerializer,
)


def parse_date_range(params, field):
    """Turn ?from=YYYY-MM-DD&to=YYYY-MM-DD into a filter on a datetime field, in clinic local time."""
    filters = {}
    tz = timezone.get_current_timezone()
    if params.get("from"):
        start = datetime.combine(datetime.strptime(params["from"], "%Y-%m-%d").date(), time.min)
        filters[f"{field}__gte"] = timezone.make_aware(start, tz)
    if params.get("to"):
        end = datetime.combine(datetime.strptime(params["to"], "%Y-%m-%d").date(), time.max)
        filters[f"{field}__lte"] = timezone.make_aware(end, tz)
    return filters


def pdf_response(content, filename, download):
    response = HttpResponse(content, content_type="application/pdf")
    disposition = "attachment" if download else "inline"
    response["Content-Disposition"] = f'{disposition}; filename="{filename}"'
    return response


class InvoiceViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, mixins.CreateModelMixin, viewsets.GenericViewSet):
    """Invoices are created and then only changed through payment, refund and cancel actions."""

    def get_queryset(self):
        qs = Invoice.objects.select_related("patient", "doctor", "created_by", "cancelled_by").prefetch_related("items")
        if self.action == "retrieve":
            qs = qs.prefetch_related("payments__received_by", "refunds__created_by")
        p = self.request.query_params
        if p.get("q"):
            term = p["q"].strip()
            qs = qs.filter(
                Q(number__icontains=term) | Q(patient__name__icontains=term)
                | Q(patient__phone__icontains=term) | Q(patient__uhid__icontains=term)
            )
        if p.get("patient"):
            qs = qs.filter(patient_id=p["patient"])
        qs = qs.filter(**parse_date_range(p, "invoice_date"))
        state = p.get("payment_status")
        active = Q(status=Invoice.Status.ACTIVE)
        if state == "PAID":
            qs = qs.filter(active, amount_paid__gte=F("total"))
        elif state == "PARTIAL":
            qs = qs.filter(active, amount_paid__gt=0, amount_paid__lt=F("total"))
        elif state == "PENDING":
            qs = qs.filter(active, amount_paid=0, total__gt=0)
        elif state == "DUE":
            qs = qs.filter(active, amount_paid__lt=F("total"))
        elif state == "CANCELLED":
            qs = qs.filter(status=Invoice.Status.CANCELLED)
        return qs

    def get_serializer_class(self):
        if self.action == "list":
            return InvoiceListSerializer
        if self.action == "create":
            return NewInvoiceSerializer
        return InvoiceDetailSerializer

    def _detail(self, invoice):
        qs = Invoice.objects.prefetch_related("items", "payments__received_by", "refunds__created_by")
        return InvoiceDetailSerializer(qs.get(pk=invoice.pk)).data

    def create(self, request, *args, **kwargs):
        serializer = NewInvoiceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        d = serializer.validated_data
        invoice = services.create_invoice(
            patient=d["patient"], doctor=d.get("doctor"), invoice_date=d.get("invoice_date"),
            items=d["items"], notes=d.get("notes", ""), user=request.user, payment=d.get("payment"),
        )
        return Response(self._detail(invoice), status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"])
    def payments(self, request, pk=None):
        invoice = self.get_object()
        serializer = PaymentInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.record_payment(invoice=invoice, user=request.user, **serializer.validated_data)
        return Response(self._detail(invoice))

    @action(detail=True, methods=["post"], permission_classes=[CanManage])
    def refund(self, request, pk=None):
        invoice = self.get_object()
        serializer = RefundInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.record_refund(invoice=invoice, user=request.user, **serializer.validated_data)
        return Response(self._detail(invoice))

    @action(detail=True, methods=["post"], permission_classes=[CanManage])
    def cancel(self, request, pk=None):
        invoice = self.get_object()
        serializer = CancelInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.cancel(invoice=invoice, reason=serializer.validated_data["reason"], user=request.user)
        return Response(self._detail(invoice))

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        invoice = self.get_object()
        return pdf_response(render_invoice_pdf(invoice), f"{invoice.number}.pdf", request.query_params.get("download"))

    @action(detail=True, methods=["get"])
    def ledger(self, request, pk=None):
        invoice = self.get_object()
        entries = LedgerEntry.objects.filter(patient=invoice.patient)
        return Response(LedgerEntrySerializer(entries, many=True).data)


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = PaymentSerializer
    search_fields = ["receipt_number", "reference", "invoice__number", "patient__name", "patient__phone"]

    def get_queryset(self):
        qs = Payment.objects.select_related("invoice", "patient", "received_by")
        p = self.request.query_params
        if p.get("mode"):
            qs = qs.filter(mode=p["mode"])
        return qs.filter(**parse_date_range(p, "paid_at"))

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        payment = self.get_object()
        return pdf_response(
            render_receipt_pdf(payment), f"{payment.receipt_number}.pdf", request.query_params.get("download")
        )


class RefundViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = RefundSerializer
    search_fields = ["refund_number", "reference", "invoice__number", "patient__name", "patient__phone"]

    def get_queryset(self):
        qs = Refund.objects.select_related("invoice", "patient", "created_by")
        return qs.filter(**parse_date_range(self.request.query_params, "refunded_at"))
