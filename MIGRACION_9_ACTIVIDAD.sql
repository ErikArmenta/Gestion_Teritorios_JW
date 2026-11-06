-- Migración 9 — Actividad de la congregación (Informes → pestaña "Actividad")
-- Copiar TODO este archivo en Supabase → SQL Editor → New query → Run.
-- Se puede correr más de una vez sin errores.

-- 9a. Meses sin actividad para considerar a alguien "inactivo" (ajustable por congregación; 3 por defecto)
ALTER TABLE congregaciones
  ADD COLUMN IF NOT EXISTS meses_inactividad SMALLINT NOT NULL DEFAULT 3;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_meses_inactividad') THEN
    ALTER TABLE congregaciones ADD CONSTRAINT chk_meses_inactividad
      CHECK (meses_inactividad BETWEEN 1 AND 24);
  END IF;
END $$;

-- 9b. Índice para buscar rápido las visitas de cada usuario (la actividad cuenta las visitas en el mapa)
CREATE INDEX IF NOT EXISTS idx_historial_usuario_fecha ON historial_visitas(usuario_id, created_at);

-- Que la API vea la columna nueva de inmediato
NOTIFY pgrst, 'reload schema';
