from django.conf import settings
from django.contrib import admin
from django.http import FileResponse, Http404
from django.urls import include, path, re_path
from django.views.static import serve
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.accounts.views import me
from apps.billing.views import InvoiceViewSet, PaymentViewSet, RefundViewSet
from apps.catalog.views import ServiceViewSet
from apps.clinic.views import DoctorViewSet, clinic_settings
from apps.patients.views import PatientViewSet
from apps.reports.views import dashboard, summary

router = DefaultRouter()
router.register("patients", PatientViewSet, basename="patient")
router.register("services", ServiceViewSet, basename="service")
router.register("doctors", DoctorViewSet, basename="doctor")
router.register("invoices", InvoiceViewSet, basename="invoice")
router.register("payments", PaymentViewSet, basename="payment")
router.register("refunds", RefundViewSet, basename="refund")


def spa(request, path=""):
    """Serve the built React app for any non-API route (single-PC / production mode)."""
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        raise Http404("Frontend not built. Run `npm run build` in frontend/.")
    return FileResponse(open(index, "rb"), content_type="text/html")


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/auth/token/", TokenObtainPairView.as_view()),
    path("api/auth/refresh/", TokenRefreshView.as_view()),
    path("api/auth/me/", me),
    path("api/clinic/", clinic_settings),
    path("api/reports/dashboard/", dashboard),
    path("api/reports/summary/", summary),
    path("api/", include(router.urls)),
    re_path(r"^media/(?P<path>.*)$", serve, {"document_root": settings.MEDIA_ROOT}),
    re_path(r"^(?!api/|admin/|static/|media/).*$", spa),
]
