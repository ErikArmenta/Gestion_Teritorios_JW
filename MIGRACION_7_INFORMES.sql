-- Migración 7 — Informes de servicio (precursores y publicadores)
-- Copiar TODO este archivo en Supabase → SQL Editor → New query → Run.
-- Se puede correr más de una vez sin errores.

-- 7a. Tipo de publicador y metas de horas de cada usuario (cualquier rol)
ALTER TABLE app_usuarios
  ADD COLUMN IF NOT EXISTS tipo_publicador    TEXT NOT NULL DEFAULT 'Publicador',
  ADD COLUMN IF NOT EXISTS meta_horas_mensual NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS meta_horas_anual   NUMERIC(6,1);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_tipo_publicador') THEN
    ALTER TABLE app_usuarios ADD CONSTRAINT chk_tipo_publicador
      CHECK (tipo_publicador IN ('Publicador', 'Precursor auxiliar', 'Precursor regular'));
  END IF;
END $$;

-- 7b. Registro de cada salida (precursores): horas de predicación o de servicio sagrado
CREATE TABLE IF NOT EXISTS registros_servicio (
  id              BIGSERIAL PRIMARY KEY,
  usuario_id      BIGINT NOT NULL REFERENCES app_usuarios(id) ON DELETE CASCADE,
  congregacion_id UUID REFERENCES congregaciones(id) ON DELETE CASCADE,
  fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
  categoria       TEXT NOT NULL DEFAULT 'predicacion'
                  CHECK (categoria IN ('predicacion', 'servicio_sagrado')),
  tipo            TEXT
                  CHECK (tipo IN ('casa_en_casa', 'cartas', 'telefono', 'exhibidor', 'informal', 'otro')),
  horas           NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (horas >= 0 AND horas <= 24),
  revisitas       INT NOT NULL DEFAULT 0 CHECK (revisitas >= 0),
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_registros_usuario_fecha ON registros_servicio(usuario_id, fecha);
CREATE INDEX IF NOT EXISTS idx_registros_congregacion_fecha ON registros_servicio(congregacion_id, fecha);

-- 7c. Informe del mes (uno por usuario por mes; `mes` = primer día del mes)
CREATE TABLE IF NOT EXISTS informes_servicio (
  id                     BIGSERIAL PRIMARY KEY,
  usuario_id             BIGINT NOT NULL REFERENCES app_usuarios(id) ON DELETE CASCADE,
  congregacion_id        UUID REFERENCES congregaciones(id) ON DELETE CASCADE,
  mes                    DATE NOT NULL CHECK (EXTRACT(DAY FROM mes) = 1),
  tipo_publicador        TEXT NOT NULL DEFAULT 'Publicador',
  predico                BOOLEAN NOT NULL DEFAULT FALSE,
  estudios               INT NOT NULL DEFAULT 0 CHECK (estudios >= 0),
  horas                  NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (horas >= 0),
  revisitas              INT NOT NULL DEFAULT 0 CHECK (revisitas >= 0),
  horas_servicio_sagrado NUMERIC(6,2) NOT NULL DEFAULT 0 CHECK (horas_servicio_sagrado >= 0),
  comentarios            TEXT,
  enviado_en             TIMESTAMPTZ DEFAULT NOW(),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (usuario_id, mes)
);
CREATE INDEX IF NOT EXISTS idx_informes_congregacion_mes ON informes_servicio(congregacion_id, mes);
