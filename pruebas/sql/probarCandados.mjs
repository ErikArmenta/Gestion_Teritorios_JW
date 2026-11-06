// Migración 13 con políticas abiertas de OTRA app (como las del Supabase real) → los candados protegen solo los nuestros
import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const R = process.argv[2];
const db = new PGlite();
await db.exec(`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE app_usuarios (id bigserial primary key, usuario text, password text, password_hash text, rol text, activo boolean, congregacion_id uuid);
INSERT INTO app_usuarios (id, usuario, rol, activo) VALUES (1,'pub','Publicador',true),(2,'adm','Admin Principal',true);
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id serial PRIMARY KEY, bucket_id text, name text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated; GRANT ALL ON storage.objects TO anon, authenticated; GRANT USAGE ON ALL SEQUENCES IN SCHEMA storage TO anon, authenticated;
INSERT INTO storage.buckets (id, name, public) VALUES ('fotos_casas','fotos_casas',true),('notas_voz','notas_voz',true),('lpa_fotos','lpa_fotos',true);
INSERT INTO storage.objects (bucket_id, name) VALUES ('fotos_casas','vieja.jpg'),('lpa_fotos','lpa.jpg');
-- Las dos políticas abiertas que salieron en el reporte (aplican a TODOS los buckets)
CREATE POLICY "Lectura pública de fotos" ON storage.objects FOR SELECT USING (true);
CREATE POLICY "Usuarios autenticados pueden subir fotos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (true);
-- y una peor, por si acaso: cualquiera borra cualquier cosa
CREATE POLICY "borrar todo" ON storage.objects FOR DELETE USING (true);`);
const sql = fs.readFileSync(`${R}/MIGRACION_13_SEGURIDAD.sql`, 'utf8');
await db.exec(sql); const r = await db.exec(sql);
console.log('reporte', JSON.stringify(r[r.length - 1].rows[0]));
const ok = [], mal = [];
const revisar = (c, t) => (c ? ok : mal).push(t);
const como = async (rol, claims) => { await db.exec('RESET ROLE'); await db.query(`SELECT set_config('request.jwt.claims',$1,false)`, [JSON.stringify(claims)]); await db.exec(`SET ROLE ${rol}`); };
const n = async (q) => { try { const x = await db.query(q); return x.rows?.[0]?.n !== undefined ? Number(x.rows[0].n) : (x.affectedRows ?? 0); } catch { return 'ERR'; } };
await como('anon', { role: 'anon' });
revisar(await n(`INSERT INTO storage.objects (bucket_id,name) VALUES ('fotos_casas','x')`) === 'ERR', 'sin sesión: no sube a fotos_casas');
revisar(await n(`SELECT count(*) n FROM storage.objects WHERE bucket_id='fotos_casas'`) === 0, 'sin sesión: no lista fotos_casas (aunque "Lectura pública" diga true)');
revisar(await n(`SELECT count(*) n FROM storage.objects WHERE bucket_id='lpa_fotos'`) === 1, 'sin sesión: la otra app SIGUE listando su bucket');
revisar(await n(`DELETE FROM storage.objects WHERE bucket_id='fotos_casas'`) === 0, 'sin sesión: no borra fotos_casas (aunque "borrar todo" diga true)');
await como('authenticated', { role: 'authenticated', sub: '00000000-0000-0000-0000-000000000001' });
revisar(await n(`INSERT INTO storage.objects (bucket_id,name) VALUES ('fotos_casas','y')`) === 'ERR', 'usuario de OTRA app (Supabase Auth): no sube a fotos_casas');
revisar(await n(`INSERT INTO storage.objects (bucket_id,name) VALUES ('lpa_fotos','y')`) === 1, 'usuario de otra app: sigue subiendo a SU bucket');
await como('anon', { role: 'anon', usuario_id: 1 });
revisar(await n(`INSERT INTO storage.objects (bucket_id,name) VALUES ('fotos_casas','z')`) === 1 && await n(`INSERT INTO storage.objects (bucket_id,name) VALUES ('notas_voz','z')`) === 1, 'publicador con sesión: sube fotos y notas');
revisar(await n(`DELETE FROM storage.objects WHERE bucket_id='fotos_casas'`) === 0, 'publicador: no borra');
await como('anon', { role: 'anon', usuario_id: 2 });
revisar(await n(`DELETE FROM storage.objects WHERE name='z' AND bucket_id='fotos_casas'`) === 1, 'admin: borra');
await db.exec('RESET ROLE');
await db.exec(fs.readFileSync(`${R}/MIGRACION_13_REVERTIR.sql`, 'utf8'));
await como('anon', { role: 'anon' });
revisar(await n(`INSERT INTO storage.objects (bucket_id,name) VALUES ('fotos_casas','w')`) === 1, 'revertir: quita también los candados');
console.log('OK (' + ok.length + '):\n- ' + ok.join('\n- ') + '\nFALLOS:\n- ' + (mal.join('\n- ') || '(ninguno)'));
process.exitCode = mal.length ? 1 : 0;
