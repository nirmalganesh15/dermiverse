import re

from rest_framework import serializers

from .models import Patient


class PatientSerializer(serializers.ModelSerializer):
    age = serializers.IntegerField(read_only=True)
    gender_label = serializers.CharField(source="get_gender_display", read_only=True)

    class Meta:
        model = Patient
        fields = [
            "id", "uhid", "name", "phone", "gender", "gender_label", "date_of_birth", "age_years", "age",
            "email", "address", "notes", "created_at",
        ]
        read_only_fields = ["uhid", "created_at"]

    def validate_name(self, value):
        value = " ".join(value.split())
        if len(value) < 2:
            raise serializers.ValidationError("Please enter the patient's full name.")
        return value

    def validate_phone(self, value):
        digits = re.sub(r"\D", "", value)
        if len(digits) < 10:
            raise serializers.ValidationError("Please enter a valid 10-digit mobile number.")
        return digits[-10:] if len(digits) == 12 and digits.startswith("91") else digits
