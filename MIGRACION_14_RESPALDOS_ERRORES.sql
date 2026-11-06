-- ════════════════════════════════════════════════════════════════════════
-- Migración 14 — Respaldos automáticos + avisos de errores de la app
-- Re-ejecutable. Supabase → SQL Editor → Run. (Requiere la 12: funciones jw_*)
-- Programar el respaldo semanal: MIGRACION_14B_PROGRAMAR_RESPALDO.sql (pasos en docs/RESPALDOS.md)
-- ════════════════════════════════════════════════════════════════════════

-- ── 14a. Bucket PRIVADO para los respaldos ──
INSERT INTO storage.buckets (id, name, public) VALUES ('respaldos', 'respaldos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Candado: NADIE desde la app (llave pública, sesión o usuarios de otras apps) puede listar, bajar,
-- subir ni borrar respaldos. Solo la Edge Function `respaldo` (service role, que no pasa por RLS).
-- Es RESTRICTIVO: manda sobre políticas abiertas de otras apps que aplican a todos los buckets.
DROP POLICY IF EXISTS jw_respaldos_candado ON storage.objects;
CREATE POLICY jw_respaldos_candado ON storage.objects AS RESTRICTIVE FOR ALL
  USING (bucket_id <> 'respaldos') WITH CHECK (bucket_id <> 'respaldos');

-- ── 14b. Errores de la app (agrupados: el mismo error suma "veces") ──
CREATE TABLE IF NOT EXISTS errores_app (
  id              BIGSERIAL PRIMARY KEY,
  firma           TEXT NOT NULL UNIQUE,          -- huella del error (mensaje + primera línea de la pila)
  mensaje         TEXT NOT NULL,
  pila            TEXT,
  ruta            TEXT,
  navegador       TEXT,
  version         TEXT,
  usuario_id      BIGINT REFERENCES app_usuarios(id) ON DELETE SET NULL,
  congregacion_id UUID,
  veces           INT NOT NULL DEFAULT 1,
  primera_vez     TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultima_vez      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resuelto        BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_errores_ultima ON errores_app(ultima_vez DESC);
ALTER TABLE errores_app ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON errores_app FROM anon, authenticated;
GRANT SELECT, UPDATE (resuelto) ON errores_app TO anon, authenticated;
DROP POLICY IF EXISTS jw_errores_ver ON errores_app;
DROP POLICY IF EXISTS jw_errores_resolver ON errores_app;
-- Solo Super Admin los ve y los marca como resueltos
CREATE POLICY jw_errores_ver ON errores_app FOR SELECT USING ((SELECT jw_es(ARRAY['Super Admin'])));
CREATE POLICY jw_errores_resolver ON errores_app FOR UPDATE
  USING ((SELECT jw_es(ARRAY['Super Admin']))) WITH CHECK ((SELECT jw_es(ARRAY['Super Admin'])));

-- La app reporta por esta función (también sin sesión: errores en la pantalla de entrada).
-- Recorta textos largos y tiene tope de 300 errores distintos por día (contra abusos).
CREATE OR REPLACE FUNCTION reportar_error(
  p_firma TEXT, p_mensaje TEXT, p_pila TEXT DEFAULT NULL, p_ruta TEXT DEFAULT NULL,
  p_navegador TEXT DEFAULT NULL, p_version TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_usuario BIGINT := jw_usuario_id();
BEGIN
  IF p_firma IS NULL OR p_firma !~ '^[a-z0-9]{4,40}$' OR coalesce(p_mensaje, '') = '' THEN RETURN; END IF;
  IF NOT EXISTS (SELECT 1 FROM errores_app WHERE firma = p_firma)
     AND (SELECT count(*) FROM errores_app WHERE primera_vez > now() - INTERVAL '1 day') >= 300 THEN
    RETURN;
  END IF;
  IF v_usuario IS NOT NULL AND NOT EXISTS (SELECT 1 FROM app_usuarios WHERE id = v_usuario) THEN v_usuario := NULL; END IF;
  INSERT INTO errores_app (firma, mensaje, pila, ruta, navegador, version, usuario_id, congregacion_id)
  VALUES (p_firma, left(p_mensaje, 500), left(p_pila, 4000), left(p_ruta, 200), left(p_navegador, 300), left(p_version, 40),
          v_usuario, jw_congregacion())
  ON CONFLICT (firma) DO UPDATE SET
    veces = errores_app.veces + 1, ultima_vez = now(), resuelto = false,
    ruta = EXCLUDED.ruta, version = EXCLUDED.version, navegador = EXCLUDED.navegador,
    usuario_id = COALESCE(EXCLUDED.usuario_id, errores_app.usuario_id),
    congregacion_id = COALESCE(EXCLUDED.congregacion_id, errores_app.congregacion_id);
END $$;
REVOKE ALL ON FUNCTION reportar_error(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION reportar_error(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

SELECT
  (SELECT public FROM storage.buckets WHERE id = 'respaldos') AS respaldos_publico_debe_ser_false,
  (SELECT count(*) FROM pg_policies WHERE policyname = 'jw_respaldos_candado') AS candado_respaldos,
  (SELECT count(*) FROM errores_app) AS errores_registrados;
