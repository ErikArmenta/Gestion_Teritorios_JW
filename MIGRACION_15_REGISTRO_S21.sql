-- ════════════════════════════════════════════════════════════════════════
-- Migración 15 — Datos del Registro de publicador (S-21)
-- Re-ejecutable. Requiere la 12 (funciones jw_*). Supabase → SQL Editor → Run.
--
-- Son datos personales delicados (fechas de nacimiento y bautismo, etc.): van en una tabla APARTE de
-- app_usuarios para que NO los vean todos los publicadores. Solo Super Admin, Admin Principal y Anciano de la
-- misma congregación (el secretario) los ven y los editan; cada quien puede ver los suyos.
-- ════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS publicador_registro (
  usuario_id        BIGINT PRIMARY KEY REFERENCES app_usuarios(id) ON DELETE CASCADE,
  sexo              TEXT CHECK (sexo IN ('Hombre', 'Mujer')),
  fecha_nacimiento  DATE,
  fecha_bautismo    DATE,
  esperanza         TEXT CHECK (esperanza IN ('Otras ovejas', 'Ungido')),
  nombramiento      TEXT CHECK (nombramiento IN ('Anciano', 'Siervo ministerial')),
  servicio_especial TEXT CHECK (servicio_especial IN ('Precursor especial', 'Misionero que sirve en el campo')),
  actualizado_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_por   BIGINT REFERENCES app_usuarios(id) ON DELETE SET NULL
);

ALTER TABLE publicador_registro ENABLE ROW LEVEL SECURITY;
REVOKE TRUNCATE, TRIGGER, REFERENCES ON publicador_registro FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON publicador_registro TO anon, authenticated;

DROP POLICY IF EXISTS jw_sel ON publicador_registro;
DROP POLICY IF EXISTS jw_editar ON publicador_registro;
-- Ver: secretario/ancianos/admins de la congregación de esa persona, o la persona misma
CREATE POLICY jw_sel ON publicador_registro FOR SELECT USING (
  (usuario_id = (SELECT jw_usuario_id()) AND (SELECT jw_rol()) IS NOT NULL)
  OR (SELECT jw_es(ARRAY['Super Admin']))
  OR ((SELECT jw_es(ARRAY['Admin Principal', 'Anciano'])) AND usuario_id IN (SELECT jw_mis_usuarios()))
);
-- Capturar / corregir: solo Super Admin, Admin Principal y Anciano (de su congregación)
CREATE POLICY jw_editar ON publicador_registro FOR ALL
  USING ((SELECT jw_es(ARRAY['Super Admin'])) OR ((SELECT jw_es(ARRAY['Admin Principal', 'Anciano'])) AND usuario_id IN (SELECT jw_mis_usuarios())))
  WITH CHECK ((SELECT jw_es(ARRAY['Super Admin'])) OR ((SELECT jw_es(ARRAY['Admin Principal', 'Anciano'])) AND usuario_id IN (SELECT jw_mis_usuarios())));

-- Quién y cuándo lo cambió (lo pone la BD, no la app)
CREATE OR REPLACE FUNCTION publicador_registro_sello() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.actualizado_en := now();
  NEW.actualizado_por := COALESCE(jw_usuario_id(), NEW.actualizado_por);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_publicador_registro_sello ON publicador_registro;
CREATE TRIGGER trg_publicador_registro_sello BEFORE INSERT OR UPDATE ON publicador_registro
  FOR EACH ROW EXECUTE FUNCTION publicador_registro_sello();

NOTIFY pgrst, 'reload schema';

SELECT (SELECT count(*) FROM pg_policies WHERE tablename = 'publicador_registro') AS politicas, (SELECT count(*) FROM publicador_registro) AS registros;
