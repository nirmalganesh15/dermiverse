"""One-time setup for a fresh install: clinic profile, the default doctor, and an admin login."""

from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.clinic.models import ClinicSettings, Doctor


class Command(BaseCommand):
    help = "Create the clinic profile, default doctor and (optionally) the first admin user."

    def add_arguments(self, parser):
        parser.add_argument("--username")
        parser.add_argument("--password")

    def handle(self, *args, username=None, password=None, **options):
        ClinicSettings.load()
        if not Doctor.objects.exists():
            Doctor.objects.create(name="Dr. Jansi Priyadharshini A", qualification="MBBS, MD (DVL)", is_default=True)
            self.stdout.write("Added default doctor.")
        if username and password and not User.objects.filter(username=username).exists():
            User.objects.create_superuser(
                username=username, password=password, first_name="Jansi", last_name="Priyadharshini",
                role=User.Role.DOCTOR,
            )
            self.stdout.write(f"Created login '{username}'.")
        self.stdout.write(self.style.SUCCESS("Clinic is set up."))
