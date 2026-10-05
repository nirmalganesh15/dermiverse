from django.db import models, transaction


class ClinicSettings(models.Model):
    """Single row holding the clinic profile and invoice preferences."""

    name = models.CharField(max_length=150, default="Dr. Jansi's Dermverse")
    subtitle = models.CharField(max_length=150, default="Skin, Hair & Laser Clinic", blank=True)
    tagline = models.CharField(max_length=200, blank=True)
    address = models.TextField(default="11/10, Jayaram Avenue, Shastri Nagar, Adyar, Chennai - 600 090")
    state = models.CharField(max_length=60, default="Tamil Nadu")
    phone = models.CharField(max_length=60, default="73580 72111")
    whatsapp = models.CharField(max_length=60, default="91765 67011")
    email = models.EmailField(default="dermverseclinic@gmail.com", blank=True)
    website = models.CharField(max_length=200, blank=True)
    google_business = models.CharField(max_length=200, default="Dr Jansi's Dermverse", blank=True)
    working_hours = models.CharField(max_length=120, default="Mon – Sat, 10:00 AM – 8:00 PM", blank=True)
    gstin = models.CharField("GSTIN", max_length=20, blank=True)
    registration_no = models.CharField("Clinic registration / licence no.", max_length=80, blank=True)

    invoice_prefix = models.CharField(max_length=10, default="DV")
    round_off_total = models.BooleanField(default=True, help_text="Round invoice totals to the nearest rupee")
    show_doctor_registration = models.BooleanField(default=False)
    invoice_terms = models.TextField(
        blank=True,
        default="This is a computer-generated invoice.\nPackages and sessions are non-transferable.",
    )
    refund_policy = models.TextField(blank=True)
    invoice_footer = models.CharField(max_length=200, blank=True, default="Thank you for choosing Dermverse.")
    signature = models.ImageField(upload_to="clinic/", blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Clinic settings"
        verbose_name_plural = "Clinic settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return self.name


class Doctor(models.Model):
    name = models.CharField(max_length=120)
    qualification = models.CharField(max_length=120, blank=True)
    registration_no = models.CharField(max_length=60, blank=True)
    is_default = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["-is_default", "name"]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if self.is_default:
            Doctor.objects.exclude(pk=self.pk).update(is_default=False)

    def __str__(self):
        return self.name


class Sequence(models.Model):
    """Gap-free document counters (invoice, receipt, refund, patient), one row per key and year."""

    key = models.CharField(max_length=30)
    year = models.PositiveIntegerField(default=0)
    last_value = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["key", "year"], name="unique_sequence_per_year")]

    @classmethod
    def next_value(cls, key, year=0):
        # Must run inside the caller's transaction so a rollback also rolls back the counter.
        with transaction.atomic():
            seq, _ = cls.objects.select_for_update().get_or_create(key=key, year=year)
            seq.last_value += 1
            seq.save(update_fields=["last_value"])
            return seq.last_value
