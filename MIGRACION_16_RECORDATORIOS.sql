-- ════════════════════════════════════════════════════════════════════════
-- Migración 16 — Recordatorios automáticos (bitácora para no repetirlos)
-- Re-ejecutable. Supabase → SQL Editor → Run. Programarlos: MIGRACION_16B_PROGRAMAR_RECORDATORIOS.sql
-- (pasos en docs/RECORDATORIOS.md). La Edge Function `recordatorios` no manda nada sin esta tabla.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS recordatorios_enviados (
  clave       TEXT PRIMARY KEY,               -- p. ej. 'informe:2026-10:2026-11-01:7', 'turno:15', 'territorios:2026-W45:7'
  usuario_id  BIGINT REFERENCES app_usuarios(id) ON DELETE CASCADE,
  enviado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recordatorios_enviado ON recordatorios_enviados(enviado_en);
-- Solo la Edge Function (service role): la app no la ve
ALTER TABLE recordatorios_enviados ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON recordatorios_enviados FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

SELECT count(*) AS recordatorios_registrados FROM recordatorios_enviados;
