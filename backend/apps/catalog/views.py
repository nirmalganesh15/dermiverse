from rest_framework import viewsets

from apps.accounts.permissions import ReadOnlyOrCanManage

from .models import Service
from .serializers import ServiceSerializer


class ServiceViewSet(viewsets.ModelViewSet):
    serializer_class = ServiceSerializer
    permission_classes = [ReadOnlyOrCanManage]
    pagination_class = None
    http_method_names = ["get", "post", "patch"]
    filterset_fields = ["category", "is_active"]
    search_fields = ["name", "code", "description"]

    def get_queryset(self):
        return Service.objects.all()
