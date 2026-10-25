-- Migración 5 — Grupos de Predicación y Trabajo de Territorios por Grupo
-- Copiar TODO este archivo en Supabase → SQL Editor → New query → Run.
-- Se puede correr más de una vez sin errores.

-- 5a. Grupos de predicación
CREATE TABLE IF NOT EXISTS grupos_predicacion (
  id              BIGSERIAL PRIMARY KEY,
  congregacion_id UUID REFERENCES congregaciones(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  color           TEXT DEFAULT '#3B82F6',
  encargado_id    BIGINT REFERENCES app_usuarios(id) ON DELETE SET NULL,
  activo          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_grupos_congregacion ON grupos_predicacion(congregacion_id);

-- 5b. Cada publicador pertenece a un grupo
ALTER TABLE app_usuarios
  ADD COLUMN IF NOT EXISTS grupo_id BIGINT REFERENCES grupos_predicacion(id) ON DELETE SET NULL;

-- 5c. Trabajo de un territorio por un grupo (un registro por cada vez que se trabaja)
CREATE TABLE IF NOT EXISTS territorio_trabajos (
  id              BIGSERIAL PRIMARY KEY,
  territorio_id   BIGINT REFERENCES territorios(id) ON DELETE CASCADE,
  grupo_id        BIGINT REFERENCES grupos_predicacion(id) ON DELETE SET NULL,
  congregacion_id UUID REFERENCES congregaciones(id) ON DELETE CASCADE,
  estado          TEXT NOT NULL DEFAULT 'en_progreso'
                  CHECK (estado IN ('en_progreso', 'completado', 'cancelado')),
  fecha_inicio    DATE DEFAULT CURRENT_DATE,
  fecha_fin       DATE,
  asignado_por    BIGINT REFERENCES app_usuarios(id) ON DELETE SET NULL,
  completado_por  BIGINT REFERENCES app_usuarios(id) ON DELETE SET NULL,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trabajos_territorio ON territorio_trabajos(territorio_id);
CREATE INDEX IF NOT EXISTS idx_trabajos_congregacion ON territorio_trabajos(congregacion_id);
-- Un territorio solo puede estar "en progreso" con un grupo a la vez
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trabajo_activo
  ON territorio_trabajos(territorio_id) WHERE estado = 'en_progreso';

-- 5d. Tiempo real (solo agrega las tablas que aún no estén en la publicación)
DO $$
DECLARE tabla TEXT;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['grupos_predicacion', 'territorio_trabajos', 'historial_visitas'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = tabla
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', tabla);
    END IF;
  END LOOP;
END $$;

-- 5e. Los grupos NO se mezclan entre congregaciones (la base de datos lo impide)

-- Un publicador solo puede estar en un grupo de su misma congregación
CREATE OR REPLACE FUNCTION validar_grupo_usuario() RETURNS trigger AS $$
BEGIN
  -- Si cambia de congregación y no se eligió grupo nuevo, sale de su grupo anterior
  IF TG_OP = 'UPDATE'
     AND NEW.congregacion_id IS DISTINCT FROM OLD.congregacion_id
     AND NEW.grupo_id IS NOT DISTINCT FROM OLD.grupo_id THEN
    NEW.grupo_id := NULL;
  END IF;
  IF NEW.grupo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM grupos_predicacion g
    WHERE g.id = NEW.grupo_id AND g.congregacion_id IS NOT DISTINCT FROM NEW.congregacion_id
  ) THEN
    RAISE EXCEPTION 'El grupo pertenece a otra congregación';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_grupo_usuario ON app_usuarios;
CREATE TRIGGER trg_validar_grupo_usuario
  BEFORE INSERT OR UPDATE OF grupo_id, congregacion_id ON app_usuarios
  FOR EACH ROW EXECUTE FUNCTION validar_grupo_usuario();

-- El encargado de un grupo debe ser de la misma congregación
CREATE OR REPLACE FUNCTION validar_encargado_grupo() RETURNS trigger AS $$
BEGIN
  IF NEW.encargado_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM app_usuarios u
    WHERE u.id = NEW.encargado_id AND u.congregacion_id IS NOT DISTINCT FROM NEW.congregacion_id
  ) THEN
    RAISE EXCEPTION 'El encargado pertenece a otra congregación';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_encargado_grupo ON grupos_predicacion;
CREATE TRIGGER trg_validar_encargado_grupo
  BEFORE INSERT OR UPDATE OF encargado_id, congregacion_id ON grupos_predicacion
  FOR EACH ROW EXECUTE FUNCTION validar_encargado_grupo();

-- Un territorio solo se asigna a un grupo de su congregación
-- (y el trabajo toma siempre la congregación del territorio)
CREATE OR REPLACE FUNCTION validar_trabajo_territorio() RETURNS trigger AS $$
DECLARE cong_territorio UUID;
BEGIN
  SELECT congregacion_id INTO cong_territorio FROM territorios WHERE id = NEW.territorio_id;
  NEW.congregacion_id := cong_territorio;
  IF NEW.grupo_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM grupos_predicacion g
    WHERE g.id = NEW.grupo_id AND g.congregacion_id IS NOT DISTINCT FROM cong_territorio
  ) THEN
    RAISE EXCEPTION 'El grupo pertenece a otra congregación';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validar_trabajo_territorio ON territorio_trabajos;
CREATE TRIGGER trg_validar_trabajo_territorio
  BEFORE INSERT OR UPDATE OF grupo_id, territorio_id ON territorio_trabajos
  FOR EACH ROW EXECUTE FUNCTION validar_trabajo_territorio();
