from datetime import datetime, time, timedelta

from django.db.models import Count, F, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from apps.billing.models import ZERO, Invoice, InvoiceItem, Payment, PaymentMode, Refund
from apps.billing.serializers import InvoiceListSerializer


def _bounds(start_date, end_date):
    tz = timezone.get_current_timezone()
    return (
        timezone.make_aware(datetime.combine(start_date, time.min), tz),
        timezone.make_aware(datetime.combine(end_date, time.max), tz),
    )


def _sum(qs, field="amount"):
    return qs.aggregate(v=Sum(field))["v"] or ZERO


def _collections(start, end):
    paid = _sum(Payment.objects.filter(paid_at__range=(start, end)))
    refunded = _sum(Refund.objects.filter(refunded_at__range=(start, end)))
    return paid, refunded


def _by_day(qs, date_field, value_field):
    tz = timezone.get_current_timezone()
    rows = qs.annotate(d=TruncDate(date_field, tzinfo=tz)).values("d").annotate(v=Sum(value_field))
    return {r["d"]: r["v"] for r in rows}


def _daily_series(start_date, end_date):
    start, end = _bounds(start_date, end_date)
    paid = _by_day(Payment.objects.filter(paid_at__range=(start, end)), "paid_at", "amount")
    refunded = _by_day(Refund.objects.filter(refunded_at__range=(start, end)), "refunded_at", "amount")
    billed = _by_day(
        Invoice.objects.filter(invoice_date__range=(start, end), status=Invoice.Status.ACTIVE), "invoice_date", "total"
    )
    days, d = [], start_date
    while d <= end_date:
        days.append({
            "date": d.isoformat(),
            "collected": paid.get(d, ZERO) - refunded.get(d, ZERO),
            "billed": billed.get(d, ZERO),
        })
        d += timedelta(days=1)
    return days


def _outstanding():
    return Invoice.objects.filter(status=Invoice.Status.ACTIVE, amount_paid__lt=F("total"))


def _list(qs):
    return InvoiceListSerializer(qs.select_related("patient", "doctor").prefetch_related("items"), many=True).data


@api_view(["GET"])
def dashboard(request):
    today = timezone.localdate()
    t_start, t_end = _bounds(today, today)
    m_start, _ = _bounds(today.replace(day=1), today)

    paid_today, refunded_today = _collections(t_start, t_end)
    paid_month, refunded_month = _collections(m_start, t_end)
    today_invoices = Invoice.objects.filter(invoice_date__range=(t_start, t_end), status=Invoice.Status.ACTIVE)
    due = _outstanding().aggregate(total=Sum("total"), paid=Sum("amount_paid"), n=Count("id"))

    by_mode = {
        row["mode"]: row["v"]
        for row in Payment.objects.filter(paid_at__range=(t_start, t_end)).values("mode").annotate(v=Sum("amount"))
    }
    return Response({
        "today": {
            "collected": paid_today - refunded_today,
            "refunded": refunded_today,
            "invoice_count": today_invoices.count(),
            "billed": _sum(today_invoices, "total"),
            "patients": today_invoices.values("patient").distinct().count(),
            "by_mode": [{"mode": m, "label": label, "amount": by_mode.get(m, ZERO)} for m, label in PaymentMode.choices],
        },
        "month": {"collected": paid_month - refunded_month, "label": today.strftime("%B")},
        "outstanding": {"amount": (due["total"] or ZERO) - (due["paid"] or ZERO), "count": due["n"]},
        "trend": _daily_series(today - timedelta(days=13), today),
        "recent_invoices": _list(Invoice.objects.all()[:6]),
        "pending_invoices": _list(_outstanding().order_by("invoice_date")[:5]),
    })


@api_view(["GET"])
def summary(request):
    today = timezone.localdate()
    try:
        start_date = datetime.strptime(request.query_params.get("from", ""), "%Y-%m-%d").date()
    except ValueError:
        start_date = today.replace(day=1)
    try:
        end_date = datetime.strptime(request.query_params.get("to", ""), "%Y-%m-%d").date()
    except ValueError:
        end_date = today
    if end_date < start_date:
        start_date, end_date = end_date, start_date
    start, end = _bounds(start_date, end_date)

    invoices = Invoice.objects.filter(invoice_date__range=(start, end))
    active = invoices.filter(status=Invoice.Status.ACTIVE)
    totals = active.aggregate(
        billed=Sum("total"), discount=Sum("discount_total"), tax=Sum("tax_total"), n=Count("id"),
        patients=Count("patient", distinct=True),
    )
    paid, refunded = _collections(start, end)

    by_mode = {
        r["mode"]: r
        for r in Payment.objects.filter(paid_at__range=(start, end)).values("mode").annotate(amount=Sum("amount"), count=Count("id"))
    }
    refunds_by_mode = {
        r["mode"]: r["v"] for r in Refund.objects.filter(refunded_at__range=(start, end)).values("mode").annotate(v=Sum("amount"))
    }
    category_labels = dict(InvoiceItem._meta.get_field("category").choices)
    items = (
        InvoiceItem.objects.filter(invoice__in=active)
        .values("description", "category")
        .annotate(quantity=Sum("quantity"), amount=Sum("line_total"), invoices=Count("invoice", distinct=True))
        .order_by("-amount")
    )
    by_category = (
        InvoiceItem.objects.filter(invoice__in=active).values("category").annotate(amount=Sum("line_total")).order_by("-amount")
    )
    outstanding = list(_outstanding().order_by("invoice_date")[:200])

    return Response({
        "range": {"from": start_date.isoformat(), "to": end_date.isoformat()},
        "totals": {
            "billed": totals["billed"] or ZERO,
            "discount": totals["discount"] or ZERO,
            "tax": totals["tax"] or ZERO,
            "invoice_count": totals["n"],
            "patient_count": totals["patients"],
            "cancelled_count": invoices.filter(status=Invoice.Status.CANCELLED).count(),
            "collected": paid,
            "refunded": refunded,
            "net_collected": paid - refunded,
        },
        "by_mode": [
            {
                "mode": m,
                "label": label,
                "amount": by_mode.get(m, {}).get("amount") or ZERO,
                "count": by_mode.get(m, {}).get("count") or 0,
                "refunded": refunds_by_mode.get(m, ZERO),
            }
            for m, label in PaymentMode.choices
        ],
        "by_service": [{**row, "category_label": category_labels.get(row["category"], row["category"])} for row in items],
        "by_category": [{**row, "label": category_labels.get(row["category"], row["category"])} for row in by_category],
        "daily": _daily_series(start_date, end_date) if (end_date - start_date).days <= 92 else [],
        "outstanding": _list(Invoice.objects.filter(pk__in=[i.pk for i in outstanding]).order_by("invoice_date")),
        "outstanding_total": sum((i.total - i.amount_paid for i in outstanding), ZERO),
    })
