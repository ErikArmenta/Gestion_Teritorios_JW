-- ════════════════════════════════════════════════════════════════════════
-- Migración 17C — Columna `metadata` en notificaciones
-- Re-ejecutable. Supabase → SQL Editor → Run.
--
-- La tabla real no la tenía (DIAGNOSTICO_ASEO.sql: notificaciones_tiene_metadata = false) y por eso fallaba
-- guardar los avisos del aseo y los de turno de exhibidor (los dos mandan datos extra en `metadata`).
-- Solo agrega la columna: no borra ni cambia nada de lo que ya hay. Los permisos de la tabla la incluyen solos.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE notificaciones ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';

SELECT EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'notificaciones' AND column_name = 'metadata') AS ya_tiene_metadata;
