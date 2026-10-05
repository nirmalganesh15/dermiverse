from rest_framework import serializers

from .models import ClinicSettings, Doctor


class ClinicSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicSettings
        exclude = ["id"]
        read_only_fields = ["updated_at"]


class DoctorSerializer(serializers.ModelSerializer):
    class Meta:
        model = Doctor
        fields = ["id", "name", "qualification", "registration_no", "is_default", "is_active"]
