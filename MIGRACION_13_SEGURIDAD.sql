-- ════════════════════════════════════════════════════════════════════════
-- Migración 13 — Seguridad: Storage (fotos y notas de voz) + límite de intentos de login
-- Requiere la Migración 12 (funciones jw_*). Re-ejecutable. Supabase → SQL Editor → Run.
-- Para deshacerla: MIGRACION_13_REVERTIR.sql
-- Solo toca los buckets fotos_casas y notas_voz (el proyecto lo comparten otras apps).
-- ════════════════════════════════════════════════════════════════════════

-- ── 13a. Buckets: siguen públicos para VER (los links de las fotos no cambian; el link compartido las
--         muestra sin sesión), pero con tamaño máximo y, las fotos, solo imágenes.
UPDATE storage.buckets SET file_size_limit = 10485760, allowed_mime_types = ARRAY['image/*']
WHERE id = 'fotos_casas';
UPDATE storage.buckets SET file_size_limit = 15728640
WHERE id = 'notas_voz';

-- ── 13b. Políticas de storage.objects: quitar las viejas de NUESTROS buckets y poner las nuevas ──
DO $$
DECLARE p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ '(fotos_casas|notas_voz)'
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

-- Subir: solo con la sesión firmada de una cuenta activa
CREATE POLICY jw_storage_subir ON storage.objects FOR INSERT
  WITH CHECK (bucket_id IN ('fotos_casas', 'notas_voz') AND (SELECT public.jw_rol()) IS NOT NULL);
-- Listar (la API; ver una foto por su link público no necesita esto): solo con sesión
CREATE POLICY jw_storage_listar ON storage.objects FOR SELECT
  USING (bucket_id IN ('fotos_casas', 'notas_voz') AND (SELECT public.jw_rol()) IS NOT NULL);
-- Borrar: solo Super Admin y Admin Principal (la app no borra archivos; queda para limpiezas)
CREATE POLICY jw_storage_borrar ON storage.objects FOR DELETE
  USING (bucket_id IN ('fotos_casas', 'notas_voz') AND (SELECT public.jw_es(ARRAY['Super Admin', 'Admin Principal'])));
-- (Sin política UPDATE: nadie reemplaza archivos desde la app)

-- ── 13c. Límite de intentos de login (lo usan las Edge Functions `sesion` y `webauthn`) ──
-- clave = 'u:<usuario>' | 'id:<id>' | 'ip:<ip>'. 5 fallos por usuario o 20 por IP → 15 minutos bloqueado.
CREATE TABLE IF NOT EXISTS login_intentos (
  clave           TEXT PRIMARY KEY,
  fallos          INT NOT NULL DEFAULT 0,
  primer_fallo    TIMESTAMPTZ NOT NULL DEFAULT now(),
  bloqueado_hasta TIMESTAMPTZ
);
ALTER TABLE login_intentos ENABLE ROW LEVEL SECURITY;  -- sin políticas: solo las Edge Functions
REVOKE ALL ON login_intentos FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Reporte ──
SELECT
  (SELECT count(*) FROM app_usuarios WHERE password IS NOT NULL AND password <> '') AS contrasenas_en_texto_plano,
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'jw\_storage\_%') AS politicas_storage,
  (SELECT string_agg(policyname || ' (' || cmd || ')', ', ') FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname NOT LIKE 'jw\_%'
       AND (coalesce(qual, 'true') = 'true' OR coalesce(with_check, 'true') = 'true')) AS otras_politicas_abiertas;
