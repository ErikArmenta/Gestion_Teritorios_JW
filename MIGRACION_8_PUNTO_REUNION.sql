-- Migración 8 — Punto de reunión en los links compartidos
-- Copiar TODO este archivo en Supabase → SQL Editor → New query → Run.
-- Se puede correr más de una vez sin errores.
--
-- Al compartir un territorio se puede marcar (opcional) dónde se junta el grupo. El link compartido
-- lo muestra en el mapa y "Cómo llegar" lleva ahí (si no hay punto, al centro del territorio).
-- Las ubicaciones en vivo del grupo NO usan tablas (Supabase Realtime, presencia): no se guardan.

ALTER TABLE territorio_compartidos
  ADD COLUMN IF NOT EXISTS punto_reunion_lat  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS punto_reunion_lng  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS punto_reunion_nota TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_punto_reunion_coords') THEN
    ALTER TABLE territorio_compartidos ADD CONSTRAINT chk_punto_reunion_coords CHECK (
      (punto_reunion_lat IS NULL AND punto_reunion_lng IS NULL)
      OR (punto_reunion_lat BETWEEN -90 AND 90 AND punto_reunion_lng BETWEEN -180 AND 180)
    );
  END IF;
END $$;

-- Para que PostgREST vea las columnas nuevas de inmediato
NOTIFY pgrst, 'reload schema';
