from django.contrib import admin

from .models import Service


@admin.register(Service)
class ServiceAdmin(admin.ModelAdmin):
    list_display = ("name", "category", "price", "tax_rate", "is_active")
    list_filter = ("category", "is_active")
    search_fields = ("name",)
