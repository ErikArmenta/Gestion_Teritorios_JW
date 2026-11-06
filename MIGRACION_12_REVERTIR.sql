-- ════════════════════════════════════════════════════════════════════════
-- REVERTIR la Migración 12 (blindaje). Deja las tablas de Gestión Territorial abiertas como antes.
-- Úsalo solo si algo falla después de correr MIGRACION_12_BLINDAJE.sql. Re-ejecutable.
-- Solo toca las tablas de Gestión Territorial (este proyecto lo comparten otras apps).
-- Las contraseñas siguen cifradas (eso es de la Migración 11 y no se revierte aquí).
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  tablas TEXT[] := ARRAY['congregaciones','app_usuarios','territorios','territorio_manzanas','territorio_asignaciones',
    'territorio_compartidos','territorio_trabajos','grupos_predicacion','casas','historial_visitas','alertas_panico',
    'notificaciones','exhibidores','exhibidor_turnos','registros_servicio','informes_servicio'];
  t TEXT; p RECORD;
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND policyname LIKE 'jw\_%' LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- La app vuelve a poder leer app_usuarios completa (como antes)
GRANT SELECT ON public.app_usuarios TO anon, authenticated;

DROP TRIGGER IF EXISTS trg_app_usuarios_proteger ON app_usuarios;

-- La app deja de exigir sesión con token
INSERT INTO seguridad_config (clave, valor) VALUES ('blindaje', 'no')
ON CONFLICT (clave) DO UPDATE SET valor = 'no';

NOTIFY pgrst, 'reload schema';

SELECT 'Blindaje revertido: todo como antes' AS resultado;
