from rest_framework import viewsets
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.accounts.permissions import ReadOnlyOrCanManage

from .models import ClinicSettings, Doctor
from .serializers import ClinicSettingsSerializer, DoctorSerializer


@api_view(["GET", "PATCH"])
@permission_classes([ReadOnlyOrCanManage])
@parser_classes([JSONParser, MultiPartParser, FormParser])
def clinic_settings(request):
    obj = ClinicSettings.load()
    if request.method == "PATCH":
        serializer = ClinicSettingsSerializer(obj, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
    return Response(ClinicSettingsSerializer(obj).data)


class DoctorViewSet(viewsets.ModelViewSet):
    queryset = Doctor.objects.all()
    serializer_class = DoctorSerializer
    permission_classes = [ReadOnlyOrCanManage]
    pagination_class = None
    http_method_names = ["get", "post", "patch"]
