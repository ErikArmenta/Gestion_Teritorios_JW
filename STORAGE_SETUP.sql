-- ============================================================
-- STORAGE SETUP — Bucket notas_voz
-- Ejecutar manualmente en el SQL Editor de Supabase si el
-- bucket no tiene policies configuradas.
-- ============================================================

-- Verificar/crear bucket notas_voz como público
INSERT INTO storage.buckets (id, name, public)
VALUES ('notas_voz', 'notas_voz', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policy: permitir subida
CREATE POLICY "allow_upload_notas_voz" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'notas_voz');

-- Policy: permitir lectura pública
CREATE POLICY "allow_read_notas_voz" ON storage.objects
  FOR SELECT USING (bucket_id = 'notas_voz');

-- Policy: permitir eliminación
CREATE POLICY "allow_delete_notas_voz" ON storage.objects
  FOR DELETE USING (bucket_id = 'notas_voz');
