-- Pre-deploy migration: clear old Odontogram data so prisma db push
-- can add the new required clinic_id column without conflict.

DO $$
BEGIN
  -- Only clear if Odontogram exists but clinic_id column does NOT exist yet
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'Odontogram'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Odontogram' AND column_name = 'clinic_id'
  ) THEN
    -- Clear entries first if table exists (cascade might not exist yet)
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'OdontogramEntry'
    ) THEN
      DELETE FROM "OdontogramEntry";
    END IF;

    DELETE FROM "Odontogram";
    RAISE NOTICE 'Cleared old Odontogram rows for schema migration';
  ELSE
    RAISE NOTICE 'Skipped: migration not needed';
  END IF;
END $$;
