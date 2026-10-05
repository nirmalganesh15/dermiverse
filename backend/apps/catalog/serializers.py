from rest_framework import serializers

from .models import Service


class ServiceSerializer(serializers.ModelSerializer):
    category_label = serializers.CharField(source="get_category_display", read_only=True)

    class Meta:
        model = Service
        fields = ["id", "name", "category", "category_label", "price", "tax_rate", "code", "description", "is_active"]
