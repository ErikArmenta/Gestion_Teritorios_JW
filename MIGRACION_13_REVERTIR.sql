-- ════════════════════════════════════════════════════════════════════════
-- REVERTIR la Migración 13: deja fotos y notas de voz como antes (subir/ver/borrar abierto) y sin
-- límites de tamaño. La tabla login_intentos se queda (sin ella el límite de intentos se apaga solo:
-- para apagarlo bórrala con DROP TABLE login_intentos;). Re-ejecutable.
-- ════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS jw_storage_subir ON storage.objects;
DROP POLICY IF EXISTS jw_storage_listar ON storage.objects;
DROP POLICY IF EXISTS jw_storage_borrar ON storage.objects;
DROP POLICY IF EXISTS jw_storage_candado_subir ON storage.objects;
DROP POLICY IF EXISTS jw_storage_candado_listar ON storage.objects;
DROP POLICY IF EXISTS jw_storage_candado_cambiar ON storage.objects;
DROP POLICY IF EXISTS jw_storage_candado_borrar ON storage.objects;

DROP POLICY IF EXISTS allow_upload_fotos_casas ON storage.objects;
DROP POLICY IF EXISTS allow_read_fotos_casas ON storage.objects;
DROP POLICY IF EXISTS allow_delete_fotos_casas ON storage.objects;
DROP POLICY IF EXISTS allow_upload_notas_voz ON storage.objects;
DROP POLICY IF EXISTS allow_read_notas_voz ON storage.objects;
DROP POLICY IF EXISTS allow_delete_notas_voz ON storage.objects;

CREATE POLICY allow_upload_fotos_casas ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'fotos_casas');
CREATE POLICY allow_read_fotos_casas ON storage.objects FOR SELECT USING (bucket_id = 'fotos_casas');
CREATE POLICY allow_delete_fotos_casas ON storage.objects FOR DELETE USING (bucket_id = 'fotos_casas');
CREATE POLICY allow_upload_notas_voz ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'notas_voz');
CREATE POLICY allow_read_notas_voz ON storage.objects FOR SELECT USING (bucket_id = 'notas_voz');
CREATE POLICY allow_delete_notas_voz ON storage.objects FOR DELETE USING (bucket_id = 'notas_voz');

UPDATE storage.buckets SET file_size_limit = NULL, allowed_mime_types = NULL WHERE id IN ('fotos_casas', 'notas_voz');

SELECT 'Storage como antes' AS resultado;
