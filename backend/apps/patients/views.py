from django.db.models import Q
from rest_framework import viewsets

from .models import Patient
from .serializers import PatientSerializer


class PatientViewSet(viewsets.ModelViewSet):
    serializer_class = PatientSerializer
    http_method_names = ["get", "post", "patch"]

    def get_queryset(self):
        qs = Patient.objects.all()
        q = self.request.query_params.get("q", "").strip()
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(phone__icontains=q) | Q(uhid__icontains=q))
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)
