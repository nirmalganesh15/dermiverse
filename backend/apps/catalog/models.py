from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class Service(models.Model):
    """Anything that can be billed: consultations, procedures, products and packages."""

    class Category(models.TextChoices):
        CONSULTATION = "CONSULTATION", "Consultation"
        PROCEDURE = "PROCEDURE", "Procedure"
        PRODUCT = "PRODUCT", "Product"
        PACKAGE = "PACKAGE", "Package"
        OTHER = "OTHER", "Other"

    name = models.CharField(max_length=150)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.PROCEDURE)
    price = models.DecimalField(max_digits=12, decimal_places=2, validators=[MinValueValidator(Decimal("0"))])
    tax_rate = models.DecimalField(
        "GST %", max_digits=5, decimal_places=2, default=Decimal("0"),
        validators=[MinValueValidator(Decimal("0")), MaxValueValidator(Decimal("28"))],
    )
    code = models.CharField("HSN / SAC code", max_length=20, blank=True)
    description = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["category", "name"]

    def __str__(self):
        return self.name
