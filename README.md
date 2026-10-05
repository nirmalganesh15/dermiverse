# Dermverse: Clinic Management System

Clinic management for **Dr. Jansi's Dermverse, Skin, Hair & Laser Clinic**, Adyar, Chennai.

**Module 1 (this release): Billing & Payments.** Invoices, part payments, receipts, refunds, cancellations,
service price list, reports and clinic settings. The navigation already shows the coming modules
(Appointments, Patients, Consultations, Treatment plans, Pharmacy, Inventory, Staff).

| Layer | Tech |
|---|---|
| Backend | Django 5.2 + Django REST Framework, JWT auth |
| Database | PostgreSQL at the clinic / cloud (SQLite for local development) |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS 4, Radix UI, TanStack Query |
| PDFs | ReportLab with bundled Inter / Cormorant Garamond fonts (₹ renders correctly offline) |
| Serving | Waitress + WhiteNoise. One process serves both the API and the built app. |

See [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md) for the palette, typography and UX rules.

## How money is stored

- Amounts are `Decimal`, never floats. Prices are GST-exclusive; the discount is applied first, then GST (shown as CGST + SGST).
- Invoice, receipt and refund numbers are sequential per year (`DV-2026-0001`, `DV-R-2026-0001`, `DV-RF-2026-0001`) and never reused.
- Invoices are **never edited**. Changes happen through payments, refunds (with a reason) or cancellation.
- Every money movement writes to an **append-only patient ledger** (`billing_ledgerentry`).
  A database trigger blocks UPDATE/DELETE on it, even with direct SQL.

## Local development

```bash
# Backend
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env          # then set DEBUG=True for development
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py setup_clinic --username admin --password dermverse-dev
.venv\Scripts\python manage.py seed_demo        # optional sample data (development only)
.venv\Scripts\python manage.py runserver

# Frontend (second terminal)
cd frontend
npm install
npm run dev                      # http://localhost:5173, API proxied to :8000
```

`admin / dermverse-dev` is a **development-only** login. Use a strong password for the clinic.

Tests: `cd backend && .venv\Scripts\python manage.py test apps`

## Installing at the clinic (one server PC, others use a browser)

1. Install Python 3.10+, Node 20+, and PostgreSQL 16 on the server PC. Give it a fixed IP on the router.
2. Create the database, copy `backend/.env.example` to `backend/.env`, and set `SECRET_KEY`, `DATABASE_URL` and `ALLOWED_HOSTS`.
3. Run `scripts\update.ps1` (installs, migrates, builds), then
   `backend\.venv\Scripts\python manage.py setup_clinic --username <name> --password <strong password>`.
4. Start with `scripts\start-clinic.ps1` (or install it as a Windows service with NSSM so it starts at boot).
   Other PCs open `http://<server-pc>:8000`.
5. **Backups:** schedule `scripts\backup.ps1 -OffsiteDir "G:\My Drive\Dermverse Backups"` daily in Task Scheduler.
   Test a restore once before go-live.

Staff logins and roles are managed at `/admin/`. Roles: **Doctor** and **Administrator** can refund, cancel and
change settings; **Front desk** can bill and collect payments.

## Moving to the cloud later

Same code. Restore the PostgreSQL dump to a managed database, upload `media/`, deploy with the new
`DATABASE_URL` / `ALLOWED_HOSTS`, and put HTTPS in front.
