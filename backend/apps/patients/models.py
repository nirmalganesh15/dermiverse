from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.clinic.models import ClinicSettings, Sequence


class Patient(models.Model):
    class Gender(models.TextChoices):
        FEMALE = "F", "Female"
        MALE = "M", "Male"
        OTHER = "O", "Other"

    uhid = models.CharField("Patient ID", max_length=20, unique=True, editable=False)
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=20, db_index=True)
    gender = models.CharField(max_length=1, choices=Gender.choices, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    age_years = models.PositiveSmallIntegerField(null=True, blank=True, help_text="Used when date of birth is unknown")
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")

    class Meta:
        ordering = ["-created_at"]

    def save(self, *args, **kwargs):
        if not self.uhid:
            prefix = ClinicSettings.load().invoice_prefix
            self.uhid = f"{prefix}P-{Sequence.next_value('patient'):05d}"
        super().save(*args, **kwargs)

    @property
    def age(self):
        if self.date_of_birth:
            today = timezone.localdate()
            dob = self.date_of_birth
            return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))
        return self.age_years

    def __str__(self):
        return f"{self.name} ({self.uhid})"
