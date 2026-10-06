#!/bin/sh
# Container entrypoint: migrate, make sure the clinic + demo login exist, load
# sample data on first boot only, then serve on the port the host provides.
set -e
python manage.py migrate --noinput
python manage.py setup_clinic --username "${DEMO_ADMIN_USERNAME:-admin}" --password "$DEMO_ADMIN_PASSWORD"
if [ "$LOAD_DEMO_DATA" = "True" ]; then
  python manage.py seed_demo || echo "Demo data already present, skipping."
fi
exec waitress-serve --listen=0.0.0.0:"${PORT:-8000}" --threads=8 config.wsgi:application
