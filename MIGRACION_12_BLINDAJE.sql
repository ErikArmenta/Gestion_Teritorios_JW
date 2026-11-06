-- ════════════════════════════════════════════════════════════════════════
-- Migración 12 — BLINDAJE (paso 3): permisos por congregación en la base de datos
-- Re-ejecutable. Supabase → SQL Editor → pegar → Run.
--
-- Qué hace: cada tabla de Gestión Territorial solo deja ver/escribir lo de TU congregación, y solo con la
-- sesión firmada (token de la Edge Function `sesion`/`webauthn`). La llave pública sola ya no ve nada.
-- Super Admin ve todas las congregaciones. Las contraseñas ya no se pueden leer desde la app.
--
-- ⚠ ESTE PROYECTO DE SUPABASE LO COMPARTEN OTRAS APPS. Esta migración SOLO toca estas tablas (por nombre):
--   congregaciones, app_usuarios, territorios, territorio_manzanas, territorio_asignaciones,
--   territorio_compartidos, territorio_trabajos, grupos_predicacion, casas, historial_visitas,
--   alertas_panico, notificaciones, exhibidores, exhibidor_turnos, registros_servicio, informes_servicio
--
-- ANTES de correrla (docs/SESION_SEGURA.md, paso 3):
--   1. App nueva publicada en Vercel.
--   2. Funciones `sesion` y `webauthn` con el código nuevo, y en Mi Perfil sale "Sesión protegida".
-- SI ALGO FALLA: corre MIGRACION_12_REVERTIR.sql (deja todo como antes en un segundo).
-- ════════════════════════════════════════════════════════════════════════

-- ── 12a. Quién eres (sale del token firmado; rol y congregación se leen de la BD, siempre al día) ──
CREATE OR REPLACE FUNCTION jw_usuario_id() RETURNS BIGINT
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE WHEN v ~ '^[0-9]{1,18}$' THEN v::BIGINT END
  FROM (SELECT NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'usuario_id' AS v) s;
$$;

-- SECURITY DEFINER: leen app_usuarios sin pasar por sus propios permisos (evita recursión).
-- Cuenta desactivada = como si no hubiera sesión (efecto inmediato, sin esperar a que venza el token).
CREATE OR REPLACE FUNCTION jw_rol() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT rol FROM app_usuarios WHERE id = jw_usuario_id() AND activo IS NOT FALSE;
$$;
CREATE OR REPLACE FUNCTION jw_congregacion() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT congregacion_id FROM app_usuarios WHERE id = jw_usuario_id() AND activo IS NOT FALSE;
$$;
CREATE OR REPLACE FUNCTION jw_es(p_roles TEXT[]) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(jw_rol() = ANY (p_roles), false);
$$;
-- Territorios / casas de mi congregación (para tablas que no tienen congregacion_id)
CREATE OR REPLACE FUNCTION jw_mis_territorios() RETURNS SETOF BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM territorios
  WHERE congregacion_id = jw_congregacion() OR jw_es(ARRAY['Super Admin']);
$$;
CREATE OR REPLACE FUNCTION jw_mis_casas() RETURNS SETOF BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id FROM casas c JOIN territorios t ON t.id = c.territorio_id
  WHERE t.congregacion_id = jw_congregacion() OR jw_es(ARRAY['Super Admin']);
$$;
CREATE OR REPLACE FUNCTION jw_mis_usuarios() RETURNS SETOF BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM app_usuarios
  WHERE congregacion_id = jw_congregacion() OR jw_es(ARRAY['Super Admin']);
$$;

-- ── 12b. Link compartido (sin sesión): SOLO ese territorio y SOLO si el link sigue vigente ──
CREATE OR REPLACE FUNCTION compartido_datos(p_id UUID) RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE c territorio_compartidos;
BEGIN
  SELECT * INTO c FROM territorio_compartidos WHERE id = p_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF c.expira_en < now() THEN RETURN jsonb_build_object('expirado', true); END IF;
  RETURN jsonb_build_object(
    'compartido', to_jsonb(c),
    'territorio', (SELECT to_jsonb(t) FROM territorios t WHERE t.id = c.territorio_id),
    'casas', COALESCE((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id) FROM casas x WHERE x.territorio_id = c.territorio_id), '[]'::jsonb)
  );
END $$;
REVOKE ALL ON FUNCTION compartido_datos(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION compartido_datos(UUID) TO anon, authenticated, service_role;

-- ── 12b2. Filas viejas sin congregación: se completa cuando se puede deducir (si no, dejarían de verse) ──
UPDATE exhibidor_turnos x SET congregacion_id = e.congregacion_id
  FROM exhibidores e WHERE x.congregacion_id IS NULL AND e.id = x.exhibidor_id AND e.congregacion_id IS NOT NULL;
UPDATE exhibidores e SET congregacion_id = u.congregacion_id
  FROM app_usuarios u WHERE e.congregacion_id IS NULL AND u.id = e.creado_por;
UPDATE exhibidor_turnos x SET congregacion_id = e.congregacion_id
  FROM exhibidores e WHERE x.congregacion_id IS NULL AND e.id = x.exhibidor_id AND e.congregacion_id IS NOT NULL;
UPDATE exhibidor_turnos x SET congregacion_id = u.congregacion_id
  FROM app_usuarios u WHERE x.congregacion_id IS NULL AND u.id = x.usuario_id;
UPDATE territorio_trabajos x SET congregacion_id = t.congregacion_id
  FROM territorios t WHERE x.congregacion_id IS NULL AND t.id = x.territorio_id;
UPDATE grupos_predicacion g SET congregacion_id = u.congregacion_id
  FROM app_usuarios u WHERE g.congregacion_id IS NULL AND u.id = g.encargado_id;
UPDATE registros_servicio r SET congregacion_id = u.congregacion_id
  FROM app_usuarios u WHERE r.congregacion_id IS NULL AND u.id = r.usuario_id;
UPDATE informes_servicio r SET congregacion_id = u.congregacion_id
  FROM app_usuarios u WHERE r.congregacion_id IS NULL AND u.id = r.usuario_id;

-- ── 12c. Quitar las políticas viejas SOLO de nuestras tablas, activar RLS y quitar TRUNCATE ──
DO $$
DECLARE
  tablas TEXT[] := ARRAY['congregaciones','app_usuarios','territorios','territorio_manzanas','territorio_asignaciones',
    'territorio_compartidos','territorio_trabajos','grupos_predicacion','casas','historial_visitas','alertas_panico',
    'notificaciones','exhibidores','exhibidor_turnos','registros_servicio','informes_servicio'];
  t TEXT; p RECORD;
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF to_regclass('public.' || t) IS NULL THEN RAISE NOTICE 'No existe %, se omite', t; CONTINUE; END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- ── 12d. Políticas ──
-- Atajos: (SELECT jw_congregacion()) y (SELECT jw_es(...)) se calculan una vez por consulta.

-- congregaciones: ves la tuya; la editan Super Admin / Admin Principal / Anciano; crear/borrar solo Super Admin
CREATE POLICY jw_sel ON congregaciones FOR SELECT
  USING (id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])));
CREATE POLICY jw_upd ON congregaciones FOR UPDATE
  USING ((SELECT jw_es(ARRAY['Super Admin'])) OR (id = (SELECT jw_congregacion()) AND (SELECT jw_es(ARRAY['Admin Principal','Anciano']))))
  WITH CHECK ((SELECT jw_es(ARRAY['Super Admin'])) OR (id = (SELECT jw_congregacion()) AND (SELECT jw_es(ARRAY['Admin Principal','Anciano']))));
CREATE POLICY jw_ins ON congregaciones FOR INSERT WITH CHECK ((SELECT jw_es(ARRAY['Super Admin'])));
CREATE POLICY jw_del ON congregaciones FOR DELETE USING ((SELECT jw_es(ARRAY['Super Admin'])));

-- app_usuarios: ves los de tu congregación; altas/bajas solo admins (Admin Principal no toca Super Admins);
-- qué columnas puede cambiar cada quien lo revisa el disparador jw_proteger_usuario (abajo)
CREATE POLICY jw_sel ON app_usuarios FOR SELECT
  USING (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])));
CREATE POLICY jw_ins ON app_usuarios FOR INSERT
  WITH CHECK ((SELECT jw_es(ARRAY['Super Admin']))
    OR ((SELECT jw_es(ARRAY['Admin Principal'])) AND congregacion_id = (SELECT jw_congregacion()) AND rol <> 'Super Admin'));
CREATE POLICY jw_upd ON app_usuarios FOR UPDATE
  USING (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])))
  WITH CHECK (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])));
CREATE POLICY jw_del ON app_usuarios FOR DELETE
  USING ((SELECT jw_es(ARRAY['Super Admin']))
    OR ((SELECT jw_es(ARRAY['Admin Principal'])) AND congregacion_id = (SELECT jw_congregacion()) AND rol <> 'Super Admin'));

-- Tablas con congregacion_id: todo lo de tu congregación
CREATE POLICY jw_todo ON territorios FOR ALL
  USING (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])))
  WITH CHECK (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])));
CREATE POLICY jw_todo ON grupos_predicacion FOR ALL
  USING (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])))
  WITH CHECK (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])));
CREATE POLICY jw_todo ON territorio_trabajos FOR ALL
  USING (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])))
  WITH CHECK (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])));
CREATE POLICY jw_todo ON alertas_panico FOR ALL
  USING (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])))
  WITH CHECK (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])));
CREATE POLICY jw_todo ON exhibidores FOR ALL
  USING (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])))
  WITH CHECK (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])));
CREATE POLICY jw_todo ON exhibidor_turnos FOR ALL
  USING (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])))
  WITH CHECK (congregacion_id = (SELECT jw_congregacion()) OR (SELECT jw_es(ARRAY['Super Admin'])));

-- Tablas que cuelgan de un territorio
CREATE POLICY jw_todo ON casas FOR ALL
  USING (territorio_id IN (SELECT jw_mis_territorios())) WITH CHECK (territorio_id IN (SELECT jw_mis_territorios()));
CREATE POLICY jw_todo ON territorio_manzanas FOR ALL
  USING (territorio_id IN (SELECT jw_mis_territorios())) WITH CHECK (territorio_id IN (SELECT jw_mis_territorios()));
CREATE POLICY jw_todo ON territorio_asignaciones FOR ALL
  USING (territorio_id IN (SELECT jw_mis_territorios())) WITH CHECK (territorio_id IN (SELECT jw_mis_territorios()));
CREATE POLICY jw_todo ON territorio_compartidos FOR ALL
  USING (territorio_id IN (SELECT jw_mis_territorios())) WITH CHECK (territorio_id IN (SELECT jw_mis_territorios()));

-- Historial: de casas de tu congregación
CREATE POLICY jw_todo ON historial_visitas FOR ALL
  USING (casa_id IN (SELECT jw_mis_casas())) WITH CHECK (casa_id IN (SELECT jw_mis_casas()));

-- Notificaciones: ves y marcas las tuyas; puedes mandarle a alguien de tu congregación
CREATE POLICY jw_sel ON notificaciones FOR SELECT USING (usuario_destino_id = (SELECT jw_usuario_id()) AND (SELECT jw_rol()) IS NOT NULL);
CREATE POLICY jw_upd ON notificaciones FOR UPDATE
  USING (usuario_destino_id = (SELECT jw_usuario_id()) AND (SELECT jw_rol()) IS NOT NULL)
  WITH CHECK (usuario_destino_id = (SELECT jw_usuario_id()));
CREATE POLICY jw_del ON notificaciones FOR DELETE USING (usuario_destino_id = (SELECT jw_usuario_id()) AND (SELECT jw_rol()) IS NOT NULL);
CREATE POLICY jw_ins ON notificaciones FOR INSERT WITH CHECK (usuario_destino_id IN (SELECT jw_mis_usuarios()));

-- Informes y salidas: los tuyos; Super Admin / Admin Principal / Anciano / Ministerial ven los de tu congregación
CREATE POLICY jw_sel ON registros_servicio FOR SELECT
  USING ((usuario_id = (SELECT jw_usuario_id()) AND (SELECT jw_rol()) IS NOT NULL)
    OR (congregacion_id = (SELECT jw_congregacion()) AND (SELECT jw_es(ARRAY['Admin Principal','Anciano','Ministerial'])))
    OR (SELECT jw_es(ARRAY['Super Admin'])));
CREATE POLICY jw_mio ON registros_servicio FOR ALL
  USING (usuario_id = (SELECT jw_usuario_id()) AND (SELECT jw_rol()) IS NOT NULL)
  WITH CHECK (usuario_id = (SELECT jw_usuario_id()) AND (SELECT jw_rol()) IS NOT NULL
    AND (congregacion_id IS NULL OR congregacion_id = (SELECT jw_congregacion())));
CREATE POLICY jw_sel ON informes_servicio FOR SELECT
  USING ((usuario_id = (SELECT jw_usuario_id()) AND (SELECT jw_rol()) IS NOT NULL)
    OR (congregacion_id = (SELECT jw_congregacion()) AND (SELECT jw_es(ARRAY['Admin Principal','Anciano','Ministerial'])))
    OR (SELECT jw_es(ARRAY['Super Admin'])));
CREATE POLICY jw_mio ON informes_servicio FOR ALL
  USING (usuario_id = (SELECT jw_usuario_id()) AND (SELECT jw_rol()) IS NOT NULL)
  WITH CHECK (usuario_id = (SELECT jw_usuario_id()) AND (SELECT jw_rol()) IS NOT NULL
    AND (congregacion_id IS NULL OR congregacion_id = (SELECT jw_congregacion())));

-- ── 12e. app_usuarios: qué columnas puede cambiar cada quien (desde la app) ──
--   Super Admin: todo.  Admin Principal: todo en su congregación, menos hacer/tocar Super Admins o cambiar congregación.
--   Los demás: en su propio usuario nombre, foto, tipo de publicador y metas (y grupo si es Anciano/Ministerial);
--   en otros usuarios solo el grupo, y solo Anciano/Ministerial. Nadie más cambia rol, activo, usuario ni contraseña.
--   Las Edge Functions (service role) y el SQL Editor no pasan por aquí.
-- (SIN security definer a propósito: current_user tiene que ser quien hace la consulta)
CREATE OR REPLACE FUNCTION jw_proteger_usuario() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_yo BIGINT := jw_usuario_id(); v_rol TEXT := jw_rol();
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  IF v_rol = 'Super Admin' THEN RETURN NEW; END IF;
  IF v_rol IS NULL THEN RAISE EXCEPTION 'Sin sesión' USING ERRCODE = '42501'; END IF;
  IF v_rol = 'Admin Principal' THEN
    IF NEW.congregacion_id IS DISTINCT FROM OLD.congregacion_id
       OR (OLD.rol = 'Super Admin' AND OLD.id <> v_yo)
       OR (NEW.rol = 'Super Admin' AND OLD.rol IS DISTINCT FROM 'Super Admin') THEN
      RAISE EXCEPTION 'No tienes permiso para ese cambio' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id <> OLD.id OR NEW.rol IS DISTINCT FROM OLD.rol OR NEW.congregacion_id IS DISTINCT FROM OLD.congregacion_id
     OR NEW.activo IS DISTINCT FROM OLD.activo OR NEW.usuario IS DISTINCT FROM OLD.usuario
     OR NEW.password IS DISTINCT FROM OLD.password OR NEW.password_hash IS DISTINCT FROM OLD.password_hash THEN
    RAISE EXCEPTION 'No tienes permiso para ese cambio' USING ERRCODE = '42501';
  END IF;
  IF OLD.id <> v_yo THEN
    IF v_rol NOT IN ('Anciano', 'Ministerial')
       OR (NEW.nombre, NEW.foto_url, NEW.tipo_publicador, NEW.meta_horas_mensual, NEW.meta_horas_anual)
          IS DISTINCT FROM (OLD.nombre, OLD.foto_url, OLD.tipo_publicador, OLD.meta_horas_mensual, OLD.meta_horas_anual) THEN
      RAISE EXCEPTION 'No tienes permiso para ese cambio' USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.grupo_id IS DISTINCT FROM OLD.grupo_id AND v_rol NOT IN ('Anciano', 'Ministerial') THEN
    RAISE EXCEPTION 'No tienes permiso para ese cambio' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
-- Corre después del de contraseñas (trg_app_usuarios_cifrar_password): los disparadores van por nombre
DROP TRIGGER IF EXISTS trg_app_usuarios_proteger ON app_usuarios;
CREATE TRIGGER trg_app_usuarios_proteger BEFORE UPDATE ON app_usuarios
  FOR EACH ROW EXECUTE FUNCTION jw_proteger_usuario();

-- ── 12f. Contraseñas: la app ya no puede leerlas (solo escribirlas; se cifran solas) ──
DO $$
DECLARE cols TEXT;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'app_usuarios' AND column_name NOT IN ('password', 'password_hash');
  EXECUTE 'REVOKE SELECT ON public.app_usuarios FROM anon, authenticated';
  EXECUTE format('GRANT SELECT (%s) ON public.app_usuarios TO anon, authenticated', cols);
END $$;

-- ── 12g. Vistas sobre nuestras tablas: que respeten los permisos de quien consulta ──
DO $$
DECLARE v RECORD;
BEGIN
  FOR v IN SELECT DISTINCT view_schema, view_name FROM information_schema.view_table_usage
           WHERE table_schema = 'public' AND view_schema = 'public' AND table_name IN (
             'congregaciones','app_usuarios','territorios','territorio_manzanas','territorio_asignaciones',
             'territorio_compartidos','territorio_trabajos','grupos_predicacion','casas','historial_visitas',
             'alertas_panico','notificaciones','exhibidores','exhibidor_turnos','registros_servicio','informes_servicio')
  LOOP
    EXECUTE format('ALTER VIEW %I.%I SET (security_invoker = true)', v.view_schema, v.view_name);
  END LOOP;
END $$;

-- ── 12h. Índices para que los permisos no hagan lenta la app ──
CREATE INDEX IF NOT EXISTS idx_casas_territorio ON casas(territorio_id);
CREATE INDEX IF NOT EXISTS idx_territorios_congregacion ON territorios(congregacion_id);
CREATE INDEX IF NOT EXISTS idx_app_usuarios_congregacion ON app_usuarios(congregacion_id);
CREATE INDEX IF NOT EXISTS idx_manzanas_territorio ON territorio_manzanas(territorio_id);
CREATE INDEX IF NOT EXISTS idx_compartidos_territorio ON territorio_compartidos(territorio_id);
CREATE INDEX IF NOT EXISTS idx_alertas_congregacion ON alertas_panico(congregacion_id);
CREATE INDEX IF NOT EXISTS idx_exhibidores_congregacion ON exhibidores(congregacion_id);
CREATE INDEX IF NOT EXISTS idx_turnos_congregacion ON exhibidor_turnos(congregacion_id);
CREATE INDEX IF NOT EXISTS idx_registros_usuario ON registros_servicio(usuario_id);
CREATE INDEX IF NOT EXISTS idx_registros_congregacion ON registros_servicio(congregacion_id);
CREATE INDEX IF NOT EXISTS idx_informes_congregacion ON informes_servicio(congregacion_id);

-- ── 12i. Avisarle a la app que la BD ya está blindada (pide entrar otra vez a sesiones sin token) ──
INSERT INTO seguridad_config (clave, valor) VALUES ('blindaje', 'si')
ON CONFLICT (clave) DO UPDATE SET valor = 'si';

NOTIFY pgrst, 'reload schema';

-- ── Reporte: lo que NO se verá en la app por no tener congregación (lo normal es 0 en todo) ──
SELECT
  (SELECT count(*) FROM exhibidores WHERE congregacion_id IS NULL)          AS exhibidores_sin_cong,
  (SELECT count(*) FROM exhibidor_turnos WHERE congregacion_id IS NULL)     AS turnos_sin_cong,
  (SELECT count(*) FROM grupos_predicacion WHERE congregacion_id IS NULL)   AS grupos_sin_cong,
  (SELECT count(*) FROM territorio_trabajos WHERE congregacion_id IS NULL)  AS trabajos_sin_cong,
  (SELECT count(*) FROM historial_visitas WHERE casa_id IS NULL)            AS historial_sin_casa,
  (SELECT count(*) FROM territorio_compartidos WHERE territorio_id IS NULL) AS compartidos_sin_territorio,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND policyname LIKE 'jw\_%') AS politicas_creadas;
