from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "ADMIN", "Administrator"
        DOCTOR = "DOCTOR", "Doctor"
        FRONT_DESK = "FRONT_DESK", "Front desk"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.FRONT_DESK)

    @property
    def display_name(self):
        return self.get_full_name() or self.username

    @property
    def can_manage(self):
        """Doctors and admins may cancel, refund and change clinic settings."""
        return self.is_superuser or self.role in (self.Role.ADMIN, self.Role.DOCTOR)
