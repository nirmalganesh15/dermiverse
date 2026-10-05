"""Demo data for development and walkthroughs. Never run this on the clinic's live database."""

import random
from datetime import timedelta
from decimal import Decimal

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.accounts.models import User
from apps.billing import services
from apps.billing.models import Invoice
from apps.catalog.models import Service
from apps.clinic.models import Doctor
from apps.patients.models import Patient

SERVICES = [
    ("Consultation – New patient", "CONSULTATION", 800, 0),
    ("Consultation – Follow-up", "CONSULTATION", 500, 0),
    ("Laser Hair Reduction – Full Face", "PROCEDURE", 3500, 18),
    ("Laser Hair Reduction – Underarms", "PROCEDURE", 2500, 18),
    ("Chemical Peel – Glycolic", "PROCEDURE", 2500, 18),
    ("HydraFacial – Signature", "PROCEDURE", 4500, 18),
    ("PRP Therapy – Scalp", "PROCEDURE", 6000, 18),
    ("Microneedling with Serum", "PROCEDURE", 5000, 18),
    ("Q-Switch Laser Toning", "PROCEDURE", 4000, 18),
    ("Acne Scar Treatment – Session", "PROCEDURE", 3000, 18),
    ("Sunscreen SPF 50 – 50 g", "PRODUCT", 650, 18),
    ("Vitamin C Serum – 30 ml", "PRODUCT", 1250, 18),
    ("Gentle Hydrating Cleanser", "PRODUCT", 480, 18),
    ("Laser Hair Reduction – 6 Session Package", "PACKAGE", 18000, 18),
]
PATIENTS = [
    ("Priya Raghavan", "9840012345", "F", 29), ("Karthik Subramanian", "9884023456", "M", 34),
    ("Ananya Krishnan", "9176034567", "F", 24), ("Meera Venkatesh", "9790045678", "F", 41),
    ("Arjun Natarajan", "9003056789", "M", 27), ("Divya Sundaram", "9444067890", "F", 31),
    ("Lakshmi Narayanan", "9962078901", "F", 52), ("Rahul Menon", "9677089012", "M", 38),
]


class Command(BaseCommand):
    help = "Load sample services, patients and invoices (development only)."

    def handle(self, *args, **options):
        if Invoice.objects.exists():
            raise CommandError("Invoices already exist; demo data is only for an empty database.")
        random.seed(7)
        user = User.objects.filter(is_superuser=True).first()
        doctor = Doctor.objects.filter(is_default=True).first()
        for name, cat, price, tax in SERVICES:
            Service.objects.get_or_create(name=name, defaults={"category": cat, "price": price, "tax_rate": tax})
        patients = [
            Patient.objects.get_or_create(phone=phone, defaults={"name": n, "gender": g, "age_years": a})[0]
            for n, phone, g, a in PATIENTS
        ]
        consults = list(Service.objects.filter(category="CONSULTATION"))
        others = list(Service.objects.exclude(category="CONSULTATION"))
        now = timezone.now()
        modes = ["UPI", "UPI", "UPI", "CASH", "CARD"]
        for day in range(13, -1, -1):
            for _ in range(random.randint(1, 4)):
                patient = random.choice(patients)
                picked = [random.choice(consults)] + random.sample(others, random.randint(0, 2))
                items = [{
                    "service": s, "description": s.name, "quantity": Decimal(1), "unit_price": s.price,
                    "discount_type": "PERCENT" if s.category == "PACKAGE" else "AMOUNT",
                    "discount_value": Decimal(10) if s.category == "PACKAGE" else Decimal(0),
                    "tax_rate": s.tax_rate, "details": "",
                } for s in picked]
                when = now - timedelta(days=day, hours=random.randint(0, 6))
                inv = services.create_invoice(
                    patient=patient, doctor=doctor, invoice_date=when, items=items, notes="", user=user,
                )
                roll = random.random()
                if roll < 0.8:
                    services.record_payment(invoice=inv, amount=inv.total, mode=random.choice(modes), user=user, paid_at=when)
                elif roll < 0.92:
                    services.record_payment(invoice=inv, amount=(inv.total / 2).quantize(Decimal("1")), mode="CASH", user=user, paid_at=when)
        self.stdout.write(self.style.SUCCESS(f"Created {Invoice.objects.count()} demo invoices."))
