from django.contrib import admin

from .models import Patient


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ("uhid", "name", "phone", "gender", "created_at")
    search_fields = ("uhid", "name", "phone")
