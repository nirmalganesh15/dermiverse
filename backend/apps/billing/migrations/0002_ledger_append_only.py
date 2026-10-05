"""Database-level guard: ledger rows can be inserted but never updated or deleted, even via raw SQL."""

from django.db import migrations

PG_UP = """
CREATE OR REPLACE FUNCTION billing_ledger_block_changes() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'Ledger entries are append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER billing_ledger_no_update BEFORE UPDATE OR DELETE ON billing_ledgerentry
    FOR EACH ROW EXECUTE FUNCTION billing_ledger_block_changes();
"""
PG_DOWN = """
DROP TRIGGER IF EXISTS billing_ledger_no_update ON billing_ledgerentry;
DROP FUNCTION IF EXISTS billing_ledger_block_changes();
"""
SQLITE_UP = [
    "CREATE TRIGGER billing_ledger_no_update BEFORE UPDATE ON billing_ledgerentry "
    "BEGIN SELECT RAISE(ABORT, 'Ledger entries are append-only'); END;",
    "CREATE TRIGGER billing_ledger_no_delete BEFORE DELETE ON billing_ledgerentry "
    "BEGIN SELECT RAISE(ABORT, 'Ledger entries are append-only'); END;",
]
SQLITE_DOWN = ["DROP TRIGGER IF EXISTS billing_ledger_no_update;", "DROP TRIGGER IF EXISTS billing_ledger_no_delete;"]


def forwards(apps, schema_editor):
    vendor = schema_editor.connection.vendor
    if vendor == "postgresql":
        schema_editor.execute(PG_UP)
    elif vendor == "sqlite":
        for sql in SQLITE_UP:
            schema_editor.execute(sql)


def backwards(apps, schema_editor):
    vendor = schema_editor.connection.vendor
    if vendor == "postgresql":
        schema_editor.execute(PG_DOWN)
    elif vendor == "sqlite":
        for sql in SQLITE_DOWN:
            schema_editor.execute(sql)


class Migration(migrations.Migration):
    dependencies = [("billing", "0001_initial")]
    operations = [migrations.RunPython(forwards, backwards)]
