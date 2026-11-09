-- ════════════════════════════════════════════════════════════════════════
-- Migración 17 — Aseo del Salón del Reino por grupos
-- Re-ejecutable. Requiere la 5 (grupos) y la 12 (funciones jw_*). Supabase → SQL Editor → Run.
--
-- Cada congregación tiene SU planeación (no se mezclan): días y hora de las reuniones, orden de los grupos y la
-- semana en que empieza la rotación. Un grupo por semana; la app y la función `recordatorios` calculan solo a
-- quién le toca cada semana (recurrente). Los cambios de una semana (otro grupo, sin aseo, otros días) van aparte.
-- Ven: toda la congregación. Cambian: Super Admin, Admin Principal, Anciano y Ministerial de esa congregación.
-- ════════════════════════════════════════════════════════════════════════

-- ── 17a. Planeación (una por congregación) ──
CREATE TABLE IF NOT EXISTS aseo_planes (
  congregacion_id  UUID PRIMARY KEY REFERENCES congregaciones(id) ON DELETE CASCADE,
  reuniones        JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{ "dia": 4, "hora": "19:30" }, { "dia": 0, "hora": "10:00" }]  (0 = domingo)
  orden_grupos     BIGINT[] NOT NULL DEFAULT '{}',        -- ids de grupos_predicacion en el orden de la rotación
  inicio           DATE NOT NULL DEFAULT CURRENT_DATE,     -- semana en que le toca al primer grupo
  avisos           BOOLEAN NOT NULL DEFAULT true,          -- mandar los recordatorios (un día antes y el mismo día)
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por  BIGINT REFERENCES app_usuarios(id) ON DELETE SET NULL
);

-- ── 17b. Cambios de una semana ──
CREATE TABLE IF NOT EXISTS aseo_cambios (
  id               BIGSERIAL PRIMARY KEY,
  congregacion_id  UUID NOT NULL REFERENCES congregaciones(id) ON DELETE CASCADE,
  semana           DATE NOT NULL,                           -- lunes de esa semana
  grupo_id         BIGINT REFERENCES grupos_predicacion(id) ON DELETE CASCADE,
  sin_aseo         BOOLEAN NOT NULL DEFAULT false,          -- asamblea, visita, etc.
  reuniones        JSONB,                                   -- si esa semana las reuniones cambian de día/hora
  nota             TEXT CHECK (nota IS NULL OR length(nota) <= 200),
  actualizado_en   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por  BIGINT REFERENCES app_usuarios(id) ON DELETE SET NULL,
  UNIQUE (congregacion_id, semana)
);
CREATE INDEX IF NOT EXISTS idx_aseo_cambios_cong ON aseo_cambios(congregacion_id, semana);

-- ── 17c. Reglas: nada de grupos de otra congregación; el lunes de la semana; quién y cuándo ──
CREATE OR REPLACE FUNCTION aseo_validar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ajenos INT;
BEGIN
  IF TG_TABLE_NAME = 'aseo_planes' THEN
    -- Grupos que ya se borraron: se quitan del orden (sin trabar la planeación)
    NEW.orden_grupos := COALESCE(ARRAY(
      SELECT g.id FROM unnest(NEW.orden_grupos) WITH ORDINALITY AS g(id, n)
      WHERE EXISTS (SELECT 1 FROM grupos_predicacion p WHERE p.id = g.id) ORDER BY g.n), '{}');
    SELECT count(*) INTO ajenos FROM unnest(NEW.orden_grupos) AS g(id)
      WHERE NOT EXISTS (SELECT 1 FROM grupos_predicacion p WHERE p.id = g.id AND p.congregacion_id = NEW.congregacion_id);
    IF ajenos > 0 THEN RAISE EXCEPTION 'El grupo pertenece a otra congregación'; END IF;
    IF jsonb_typeof(NEW.reuniones) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'reuniones debe ser una lista'; END IF;
    NEW.inicio := NEW.inicio - ((EXTRACT(ISODOW FROM NEW.inicio)::INT) - 1);
  ELSE
    IF NEW.grupo_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM grupos_predicacion p WHERE p.id = NEW.grupo_id AND p.congregacion_id = NEW.congregacion_id) THEN
      RAISE EXCEPTION 'El grupo pertenece a otra congregación';
    END IF;
    IF NEW.reuniones IS NOT NULL AND jsonb_typeof(NEW.reuniones) <> 'array' THEN RAISE EXCEPTION 'reuniones debe ser una lista'; END IF;
    NEW.semana := NEW.semana - ((EXTRACT(ISODOW FROM NEW.semana)::INT) - 1);
  END IF;
  NEW.actualizado_en := now();
  NEW.actualizado_por := COALESCE(jw_usuario_id(), NEW.actualizado_por);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_aseo_planes_validar ON aseo_planes;
CREATE TRIGGER trg_aseo_planes_validar BEFORE INSERT OR UPDATE ON aseo_planes
  FOR EACH ROW EXECUTE FUNCTION aseo_validar();
DROP TRIGGER IF EXISTS trg_aseo_cambios_validar ON aseo_cambios;
CREATE TRIGGER trg_aseo_cambios_validar BEFORE INSERT OR UPDATE ON aseo_cambios
  FOR EACH ROW EXECUTE FUNCTION aseo_validar();

-- ── 17d. Permisos (RLS por congregación, como la Migración 12) ──
ALTER TABLE aseo_planes ENABLE ROW LEVEL SECURITY;
ALTER TABLE aseo_cambios ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON aseo_planes, aseo_cambios FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON aseo_planes, aseo_cambios TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE aseo_cambios_id_seq TO anon, authenticated;

DROP POLICY IF EXISTS jw_sel ON aseo_planes;
DROP POLICY IF EXISTS jw_editar ON aseo_planes;
DROP POLICY IF EXISTS jw_sel ON aseo_cambios;
DROP POLICY IF EXISTS jw_editar ON aseo_cambios;

CREATE POLICY jw_sel ON aseo_planes FOR SELECT
  USING (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])));
CREATE POLICY jw_editar ON aseo_planes FOR ALL
  USING ((SELECT jw_es(ARRAY['Super Admin']))
    OR ((SELECT jw_es(ARRAY['Admin Principal', 'Anciano', 'Ministerial'])) AND congregacion_id = (SELECT jw_congregacion())))
  WITH CHECK ((SELECT jw_es(ARRAY['Super Admin']))
    OR ((SELECT jw_es(ARRAY['Admin Principal', 'Anciano', 'Ministerial'])) AND congregacion_id = (SELECT jw_congregacion())));

CREATE POLICY jw_sel ON aseo_cambios FOR SELECT
  USING (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])));
CREATE POLICY jw_editar ON aseo_cambios FOR ALL
  USING ((SELECT jw_es(ARRAY['Super Admin']))
    OR ((SELECT jw_es(ARRAY['Admin Principal', 'Anciano', 'Ministerial'])) AND congregacion_id = (SELECT jw_congregacion())))
  WITH CHECK ((SELECT jw_es(ARRAY['Super Admin']))
    OR ((SELECT jw_es(ARRAY['Admin Principal', 'Anciano', 'Ministerial'])) AND congregacion_id = (SELECT jw_congregacion())));

NOTIFY pgrst, 'reload schema';

SELECT
  (SELECT count(*) FROM pg_policies WHERE tablename IN ('aseo_planes', 'aseo_cambios')) AS politicas,
  (SELECT count(*) FROM aseo_planes) AS planes,
  (SELECT count(*) FROM aseo_cambios) AS cambios;
