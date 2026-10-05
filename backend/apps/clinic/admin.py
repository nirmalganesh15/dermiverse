from django.contrib import admin

from .models import ClinicSettings, Doctor, Sequence

admin.site.register(ClinicSettings)
admin.site.register(Doctor)


@admin.register(Sequence)
class SequenceAdmin(admin.ModelAdmin):
    list_display = ("key", "year", "last_value")
