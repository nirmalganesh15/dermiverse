from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class DermUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (("Clinic role", {"fields": ("role",)}),)
    list_display = ("username", "first_name", "last_name", "role", "is_active")
