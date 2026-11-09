// Migración 12 (blindaje) sobre el esquema REAL (del diagnóstico), con Migración 11 aplicada antes.
// Simula PostgREST: SET ROLE anon + request.jwt.claims con el usuario_id del token.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';

const RAIZ = process.argv[2];
const leer = (f) => fs.readFileSync(`${RAIZ}/${f}`, 'utf8');
const ok = [], fallo = [];
const revisar = (c, t) => (c ? ok : fallo).push(t);
const db = new PGlite({ extensions: { pgcrypto } });

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222';
await db.exec(`
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE TABLE congregaciones (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text NOT NULL, clave text NOT NULL, created_at timestamptz DEFAULT now());
CREATE TABLE grupos_predicacion (id bigserial PRIMARY KEY, congregacion_id uuid REFERENCES congregaciones(id) ON DELETE CASCADE, nombre text NOT NULL, color text, encargado_id bigint, activo boolean, created_at timestamptz DEFAULT now());
CREATE TABLE app_usuarios (id bigserial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), nombre text NOT NULL, usuario text NOT NULL UNIQUE, password text NOT NULL, rol text NOT NULL, activo boolean, foto_url text,
  congregacion_id uuid NOT NULL REFERENCES congregaciones(id), grupo_id bigint REFERENCES grupos_predicacion(id) ON DELETE SET NULL, tipo_publicador text NOT NULL DEFAULT 'Publicador', meta_horas_mensual numeric(5,1), meta_horas_anual numeric(6,1));
ALTER TABLE grupos_predicacion ADD FOREIGN KEY (encargado_id) REFERENCES app_usuarios(id) ON DELETE SET NULL;
CREATE TABLE territorios (id bigserial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), nombre text NOT NULL, descripcion text, responsable text, color text, coordenadas jsonb NOT NULL, congregacion_id uuid NOT NULL REFERENCES congregaciones(id), numero text);
CREATE TABLE territorio_manzanas (id bigserial PRIMARY KEY, territorio_id bigint NOT NULL REFERENCES territorios(id) ON DELETE CASCADE, nombre text NOT NULL, coordenadas jsonb NOT NULL, color text, created_at timestamptz DEFAULT now());
CREATE TABLE casas (id bigserial PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), territorio_id bigint NOT NULL REFERENCES territorios(id) ON DELETE CASCADE, territorio_nombre text, direccion text NOT NULL, latitud double precision NOT NULL, longitud double precision NOT NULL, estado text, fecha_visita timestamptz, nombre_contacto text, telefono text, tiene_caso_especial boolean, tipo_caso text, detalles_caso text, notas text, foto_url text, audio_url text, manzana_id bigint REFERENCES territorio_manzanas(id) ON DELETE SET NULL);
CREATE TABLE historial_visitas (id bigserial PRIMARY KEY, casa_id bigint REFERENCES casas(id) ON DELETE CASCADE, usuario_id bigint REFERENCES app_usuarios(id) ON DELETE SET NULL, usuario_nombre text, estado_anterior text, estado_nuevo text, notas text, created_at timestamptz DEFAULT now());
CREATE TABLE territorio_asignaciones (id bigserial PRIMARY KEY, territorio_id bigint REFERENCES territorios(id) ON DELETE CASCADE, usuario_id bigint REFERENCES app_usuarios(id) ON DELETE CASCADE, asignado_por bigint REFERENCES app_usuarios(id) ON DELETE SET NULL, fecha_inicio date, fecha_fin date, activa boolean, notas text, created_at timestamptz DEFAULT now());
CREATE TABLE territorio_compartidos (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), territorio_id bigint REFERENCES territorios(id) ON DELETE CASCADE, creado_por bigint REFERENCES app_usuarios(id), expira_en timestamptz NOT NULL, created_at timestamptz DEFAULT now(), punto_reunion_lat double precision, punto_reunion_lng double precision, punto_reunion_nota text);
CREATE TABLE territorio_trabajos (id bigserial PRIMARY KEY, territorio_id bigint REFERENCES territorios(id) ON DELETE CASCADE, grupo_id bigint REFERENCES grupos_predicacion(id) ON DELETE SET NULL, congregacion_id uuid REFERENCES congregaciones(id) ON DELETE CASCADE, estado text NOT NULL DEFAULT 'en_progreso', fecha_inicio date, fecha_fin date, asignado_por bigint, completado_por bigint, notas text, created_at timestamptz DEFAULT now());
CREATE TABLE alertas_panico (id serial PRIMARY KEY, usuario_id integer REFERENCES app_usuarios(id), latitud numeric, longitud numeric, mensaje text, tipo text, activa boolean, respondieron jsonb, created_at timestamp DEFAULT now(), cerrada_at timestamp, congregacion_id uuid NOT NULL REFERENCES congregaciones(id));
CREATE TABLE notificaciones (id bigserial PRIMARY KEY, usuario_destino_id bigint NOT NULL REFERENCES app_usuarios(id), tipo text, titulo text NOT NULL, mensaje text, leida boolean, created_at timestamptz DEFAULT now());
CREATE TABLE exhibidores (id bigserial PRIMARY KEY, nombre text NOT NULL, descripcion text, direccion text, latitud double precision NOT NULL, longitud double precision NOT NULL, color text, activo boolean, congregacion_id uuid REFERENCES congregaciones(id) ON DELETE CASCADE, creado_por bigint REFERENCES app_usuarios(id), created_at timestamptz DEFAULT now());
CREATE TABLE exhibidor_turnos (id bigserial PRIMARY KEY, exhibidor_id bigint NOT NULL REFERENCES exhibidores(id) ON DELETE CASCADE, usuario_id bigint NOT NULL REFERENCES app_usuarios(id) ON DELETE CASCADE, asignado_por bigint REFERENCES app_usuarios(id), fecha date NOT NULL, hora_inicio time NOT NULL, hora_fin time NOT NULL, estado text, notas text, congregacion_id uuid REFERENCES congregaciones(id) ON DELETE CASCADE, created_at timestamptz DEFAULT now());
CREATE TABLE registros_servicio (id bigserial PRIMARY KEY, usuario_id bigint NOT NULL REFERENCES app_usuarios(id) ON DELETE CASCADE, congregacion_id uuid REFERENCES congregaciones(id) ON DELETE CASCADE, fecha date NOT NULL, categoria text NOT NULL, tipo text, horas numeric(5,2) NOT NULL, revisitas integer NOT NULL DEFAULT 0, notas text, created_at timestamptz DEFAULT now());
CREATE TABLE informes_servicio (id bigserial PRIMARY KEY, usuario_id bigint NOT NULL REFERENCES app_usuarios(id) ON DELETE CASCADE, congregacion_id uuid REFERENCES congregaciones(id) ON DELETE CASCADE, mes date NOT NULL, tipo_publicador text NOT NULL, predico boolean NOT NULL, estudios integer NOT NULL DEFAULT 0, horas numeric(6,2) NOT NULL DEFAULT 0, revisitas integer NOT NULL DEFAULT 0, horas_servicio_sagrado numeric(6,2) NOT NULL DEFAULT 0, comentarios text, enviado_en timestamptz, created_at timestamptz DEFAULT now());
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text, owner_id text);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated;
GRANT ALL ON storage.objects TO anon, authenticated;
INSERT INTO storage.buckets (id, name, public) VALUES ('fotos_casas','fotos_casas',true), ('notas_voz','notas_voz',true), ('otra_app','otra_app',true);
CREATE POLICY "allow_upload_notas_voz" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'notas_voz');
CREATE POLICY "allow_delete_notas_voz" ON storage.objects FOR DELETE USING (bucket_id = 'notas_voz');
CREATE POLICY "fotos abiertas" ON storage.objects FOR ALL USING (bucket_id = 'fotos_casas');
CREATE POLICY "otra app sube" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'otra_app');
INSERT INTO storage.objects (bucket_id, name) VALUES ('fotos_casas', 'vieja.jpg'), ('otra_app', 'x.png');
-- Tabla de OTRA app en el mismo proyecto (no se debe tocar)
CREATE TABLE maquinas (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nombre text);
INSERT INTO maquinas (nombre) VALUES ('Prensa 1');
-- Una vista sobre nuestras tablas
CREATE VIEW v_casas_por_territorio AS SELECT territorio_id, count(*) n FROM casas GROUP BY territorio_id;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

INSERT INTO congregaciones (id, nombre, clave) VALUES ('${A}', 'Centro', 'A'), ('${B}', 'Norte', 'B');
INSERT INTO app_usuarios (id, nombre, usuario, password, rol, congregacion_id, activo) VALUES
  (1, 'Súper', 'super', 's', 'Super Admin', '${A}', true),
  (2, 'AdminA', 'admina', 'a', 'Admin Principal', '${A}', true),
  (3, 'AncianoA', 'ancianoa', 'x', 'Anciano', '${A}', true),
  (4, 'PubA', 'puba', 'p', 'Publicador', '${A}', true),
  (5, 'PubB', 'pubb', 'q', 'Publicador', '${B}', true),
  (6, 'AdminB', 'adminb', 'b', 'Admin Principal', '${B}', true),
  (7, 'Inactivo', 'inactivo', 'i', 'Publicador', '${A}', false),
  (8, 'MinistA', 'minista', 'm', 'Ministerial', '${A}', true);
SELECT setval('app_usuarios_id_seq', 100);
INSERT INTO grupos_predicacion (id, congregacion_id, nombre, encargado_id) VALUES (1, '${A}', 'G-A', 3), (2, '${B}', 'G-B', 5);
INSERT INTO territorios (id, nombre, coordenadas, congregacion_id) VALUES (1, 'T-A', '[]', '${A}'), (2, 'T-B', '[]', '${B}');
SELECT setval('territorios_id_seq', 100);
INSERT INTO territorio_manzanas (territorio_id, nombre, coordenadas) VALUES (1, 'M-A', '[]'), (2, 'M-B', '[]');
INSERT INTO casas (id, territorio_id, direccion, latitud, longitud, telefono) VALUES (1, 1, 'Casa A1', 0, 0, '555'), (2, 1, 'Casa A2', 0, 0, null), (3, 2, 'Casa B1', 0, 0, '777');
SELECT setval('casas_id_seq', 100);
INSERT INTO historial_visitas (casa_id, usuario_id, estado_nuevo) VALUES (1, 4, 'Visitada'), (3, 5, 'Visitada');
INSERT INTO territorio_asignaciones (territorio_id, usuario_id) VALUES (1, 4), (2, 5);
INSERT INTO territorio_compartidos (id, territorio_id, expira_en) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 1, now() + interval '1 day'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 1, now() - interval '1 day'),
  ('bbbbbbbb-0000-0000-0000-000000000001', 2, now() + interval '1 day');
INSERT INTO territorio_trabajos (territorio_id, grupo_id, congregacion_id) VALUES (1, 1, '${A}'), (2, 2, NULL);
INSERT INTO alertas_panico (usuario_id, congregacion_id, activa) VALUES (4, '${A}', true), (5, '${B}', true);
INSERT INTO notificaciones (usuario_destino_id, titulo) VALUES (4, 'para PubA'), (5, 'para PubB'), (3, 'para AncianoA');
INSERT INTO exhibidores (id, nombre, latitud, longitud, congregacion_id, creado_por) VALUES (1, 'E-A', 0, 0, '${A}', 2), (2, 'E-B', 0, 0, '${B}', 6), (3, 'E-viejo', 0, 0, NULL, 2);
INSERT INTO exhibidor_turnos (exhibidor_id, usuario_id, fecha, hora_inicio, hora_fin, congregacion_id) VALUES (1, 4, now(), '10:00', '11:00', '${A}'), (3, 4, now(), '10:00', '11:00', NULL), (2, 5, now(), '10:00', '11:00', '${B}');
INSERT INTO registros_servicio (usuario_id, congregacion_id, fecha, categoria, horas) VALUES (4, '${A}', now(), 'predicacion', 2), (3, '${A}', now(), 'predicacion', 1), (5, '${B}', now(), 'predicacion', 3), (8, NULL, now(), 'predicacion', 1);
INSERT INTO informes_servicio (usuario_id, congregacion_id, mes, tipo_publicador, predico) VALUES (4, '${A}', '2026-10-01', 'Publicador', true), (5, '${B}', '2026-10-01', 'Publicador', true);
`);
// Migraciones reales
await db.exec(leer('MIGRACION_10_WEBAUTHN.sql').replace(/REVOKE ALL ON SEQUENCE[^;]*;/, ''));
await db.exec(leer('MIGRACION_11_PASSWORDS.sql'));
const sql12 = leer('MIGRACION_12_BLINDAJE.sql');
const r12 = await db.exec(sql12);
const reporte = r12[r12.length - 1].rows[0];
revisar(Number(reporte.exhibidores_sin_cong) === 0 && Number(reporte.turnos_sin_cong) === 0 && Number(reporte.trabajos_sin_cong) === 0,
  `reporte final: filas sin congregación rellenadas (${JSON.stringify(reporte)})`);
await db.exec(sql12); // re-ejecutable
revisar(true, 'la Migración 12 se puede correr dos veces');

// ── Simular peticiones de la app ──
const como = async (id) => {
  await db.exec('RESET ROLE');
  await db.query(`SELECT set_config('request.jwt.claims', $1, false)`, [JSON.stringify(id ? { role: 'anon', usuario_id: id } : { role: 'anon' })]);
  await db.exec('SET ROLE anon');
};
const filas = async (sql, p) => (await db.query(sql, p)).rows;
const n = async (tabla) => Number((await filas(`SELECT count(*) n FROM ${tabla}`))[0].n);
const falla = async (sql, p) => { try { await db.query(sql, p); return false; } catch (e) { return e.message; } };
const afecta = async (sql, p) => (await db.query(sql, p)).affectedRows ?? 0;

const TABLAS = ['congregaciones', 'app_usuarios', 'territorios', 'territorio_manzanas', 'territorio_asignaciones', 'territorio_compartidos',
  'territorio_trabajos', 'grupos_predicacion', 'casas', 'historial_visitas', 'alertas_panico', 'notificaciones', 'exhibidores',
  'exhibidor_turnos', 'registros_servicio', 'informes_servicio'];

// 1) Sin sesión (llave pública sola)
await como(null);
const vistos = {};
for (const t of TABLAS) vistos[t] = await n(t);
revisar(Object.values(vistos).every(v => v === 0), `sin sesión: no ve NADA (${JSON.stringify(vistos)})`);
revisar(!!(await falla(`INSERT INTO casas (territorio_id, direccion, latitud, longitud) VALUES (1, 'x', 0, 0)`)), 'sin sesión: no puede crear casas');
revisar(await afecta(`UPDATE casas SET notas = 'hack'`) === 0 && await afecta(`DELETE FROM casas`) === 0, 'sin sesión: no puede editar ni borrar casas');
revisar(Number((await filas(`SELECT count(*) n FROM v_casas_por_territorio`))[0].n) === 0, 'sin sesión: la vista tampoco deja ver');
revisar(Number((await filas(`SELECT count(*) n FROM maquinas`))[0].n) === 1, 'la tabla de la otra app NO se tocó');
let comp = (await filas(`SELECT compartido_datos('aaaaaaaa-0000-0000-0000-000000000001') d`))[0].d;
revisar(comp?.territorio?.nombre === 'T-A' && comp.casas.length === 2 && comp.casas.every(c => c.territorio_id === 1) && comp.compartido?.id, 'link compartido vigente: solo ese territorio y sus casas');
comp = (await filas(`SELECT compartido_datos('aaaaaaaa-0000-0000-0000-000000000002') d`))[0].d;
revisar(comp?.expirado === true && !comp.casas && !comp.territorio, 'link vencido: solo dice expirado (sin datos)');
comp = (await filas(`SELECT compartido_datos('cccccccc-0000-0000-0000-000000000009') d`))[0].d;
revisar(comp === null, 'link inexistente: nada');
revisar(!!(await falla(`SELECT jw_mis_casas()`)) === false, '(funciones jw_ visibles pero sin sesión devuelven vacío)');
revisar((await filas(`SELECT count(*) n FROM jw_mis_casas()`))[0].n == 0, 'sin sesión: jw_mis_casas vacío');
revisar(!!(await falla(`SELECT verificar_password('s', 'super')`)), 'sin sesión: no puede usar verificar_password');

// 2) Publicador de A
await como(4);
revisar(await n('territorios') === 1 && await n('casas') === 2 && await n('historial_visitas') === 1, 'PubA: ve solo territorios/casas/historial de su congregación');
revisar(await n('app_usuarios') === 6 && await n('congregaciones') === 1, 'PubA: ve solo usuarios y congregación propios');
revisar(await n('notificaciones') === 1 && await n('registros_servicio') === 1 && await n('informes_servicio') === 1, 'PubA: notificaciones, salidas e informes solo los suyos');
revisar(await n('exhibidores') === 2 && await n('exhibidor_turnos') === 2 && await n('territorio_trabajos') === 1 && await n('alertas_panico') === 1, 'PubA: exhibidores (incluido el viejo rellenado), turnos, trabajos y alertas de A');
revisar(await n('territorio_compartidos') === 2 && await n('territorio_manzanas') === 1 && await n('territorio_asignaciones') === 1 && await n('grupos_predicacion') === 1, 'PubA: compartidos, manzanas, asignaciones y grupos de A');
revisar(Number((await filas(`SELECT n FROM v_casas_por_territorio`))[0]?.n) === 2 && (await filas(`SELECT * FROM v_casas_por_territorio`)).length === 1, 'PubA: la vista respeta los permisos');
const e1 = await falla(`SELECT * FROM app_usuarios`);
revisar(/permission denied/.test(e1 || ''), 'select * en app_usuarios: denegado (por las contraseñas)');
revisar(!!(await falla(`SELECT password FROM app_usuarios`)) && !!(await falla(`SELECT password_hash FROM app_usuarios`)), 'nadie puede leer password ni password_hash');
revisar((await filas(`SELECT id, nombre, usuario, rol, activo, foto_url, congregacion_id, created_at, grupo_id, tipo_publicador, meta_horas_mensual, meta_horas_anual FROM app_usuarios`)).length === 6, 'columnas que usa la app: sí');
revisar(Number((await filas(`SELECT count(*) n FROM app_usuarios`))[0].n) === 6, 'count(*) en app_usuarios funciona (CongregacionesList)');
revisar((await filas(`SELECT t.id, (SELECT json_agg(json_build_object('id', u.id, 'nombre', u.nombre)) FROM app_usuarios u WHERE u.id = t.usuario_id) x FROM territorio_asignaciones t`)).length === 1, 'relaciones embebidas (id, nombre) funcionan');
revisar(!!(await falla(`INSERT INTO casas (territorio_id, direccion, latitud, longitud) VALUES (2, 'en B', 0, 0)`)), 'PubA: NO puede crear casa en territorio de B');
revisar(await afecta(`INSERT INTO casas (territorio_id, direccion, latitud, longitud) VALUES (1, 'nueva A', 0, 0)`) === 1, 'PubA: sí crea casa en su territorio');
revisar(await afecta(`INSERT INTO historial_visitas (casa_id, usuario_id, estado_nuevo) VALUES (1, 4, 'Revisita')`) === 1 && !!(await falla(`INSERT INTO historial_visitas (casa_id, usuario_id) VALUES (3, 4)`)), 'PubA: registra visitas solo en casas de A');
revisar(await afecta(`UPDATE casas SET notas = 'x' WHERE id = 3`) === 0 && await afecta(`DELETE FROM casas WHERE id = 3`) === 0, 'PubA: no edita ni borra casas de B');
revisar(!!(await falla(`UPDATE casas SET territorio_id = 2 WHERE id = 1`)), 'PubA: no puede mover una casa a otra congregación');
revisar(await afecta(`UPDATE app_usuarios SET nombre = 'Pub A.', meta_horas_mensual = 30 WHERE id = 4`) === 1, 'PubA: cambia su nombre y metas');
revisar(/permiso/.test(await falla(`UPDATE app_usuarios SET rol = 'Super Admin' WHERE id = 4`) || ''), 'PubA: NO puede hacerse Super Admin');
revisar(/permiso/.test(await falla(`UPDATE app_usuarios SET activo = true WHERE id = 7`) || '') || await afecta(`UPDATE app_usuarios SET activo = true WHERE id = 7`) === 0, 'PubA: no puede reactivar a otro');
revisar(/permiso/.test(await falla(`UPDATE app_usuarios SET password = 'nueva' WHERE id = 3`) || ''), 'PubA: no cambia contraseñas de otros');
revisar(/permiso/.test(await falla(`UPDATE app_usuarios SET grupo_id = 1 WHERE id = 8`) || ''), 'PubA: no cambia grupos');
revisar(await afecta(`UPDATE app_usuarios SET nombre = 'x' WHERE id = 5`) === 0, 'PubA: no toca usuarios de B');
revisar(!!(await falla(`INSERT INTO app_usuarios (nombre, usuario, password, rol, congregacion_id) VALUES ('n', 'nuevo', 'p', 'Publicador', '${A}')`)), 'PubA: no crea usuarios');
revisar(await afecta(`INSERT INTO notificaciones (usuario_destino_id, titulo) VALUES (3, 'hola')`) === 1 && !!(await falla(`INSERT INTO notificaciones (usuario_destino_id, titulo) VALUES (5, 'a B')`)), 'PubA: notifica a gente de A, no de B');
revisar(await afecta(`UPDATE notificaciones SET leida = true WHERE usuario_destino_id = 4`) === 1 && await afecta(`UPDATE notificaciones SET leida = true WHERE usuario_destino_id = 3`) === 0, 'PubA: marca leídas solo las suyas');
revisar(await afecta(`INSERT INTO registros_servicio (usuario_id, congregacion_id, fecha, categoria, horas) VALUES (4, '${A}', now(), 'predicacion', 1)`) === 1, 'PubA: anota su salida');
revisar(!!(await falla(`INSERT INTO registros_servicio (usuario_id, congregacion_id, fecha, categoria, horas) VALUES (3, '${A}', now(), 'predicacion', 9)`)), 'PubA: no anota salidas a nombre de otro');
revisar(!!(await falla(`INSERT INTO informes_servicio (usuario_id, congregacion_id, mes, tipo_publicador, predico) VALUES (4, '${B}', '2026-11-01', 'Publicador', true)`)), 'PubA: no manda su informe a otra congregación');
revisar(await afecta(`UPDATE congregaciones SET nombre = 'hack'`) === 0, 'PubA: no edita la congregación');
revisar(await afecta(`INSERT INTO alertas_panico (usuario_id, congregacion_id, activa) VALUES (4, '${A}', true)`) === 1 && !!(await falla(`INSERT INTO alertas_panico (usuario_id, congregacion_id) VALUES (4, '${B}')`)), 'PubA: alerta de pánico solo a su congregación');
revisar(await afecta(`UPDATE alertas_panico SET respondieron = '[3]' WHERE congregacion_id = '${A}'`) >= 1, 'PubA: puede responder alertas de A');
revisar(!!(await falla(`TRUNCATE casas`)), 'nadie puede vaciar tablas (TRUNCATE)');

// 3) Anciano de A
await como(3);
revisar(await n('registros_servicio') === 4 && await n('informes_servicio') === 1, 'Anciano A: ve salidas e informes de A (no de B)');
revisar(await afecta(`UPDATE app_usuarios SET grupo_id = 1 WHERE id = 4`) === 1, 'Anciano A: asigna grupos');
revisar(/permiso/.test(await falla(`UPDATE app_usuarios SET nombre = 'otro' WHERE id = 4`) || ''), 'Anciano A: no cambia el nombre de otro');
revisar(/permiso/.test(await falla(`UPDATE app_usuarios SET rol = 'Admin Principal' WHERE id = 3`) || ''), 'Anciano A: no se sube de rol');
revisar(await afecta(`UPDATE congregaciones SET nombre = 'Centro' WHERE id = '${A}'`) === 1, 'Anciano A: edita su congregación (meses de inactividad)');
revisar(await afecta(`UPDATE registros_servicio SET horas = 99 WHERE usuario_id = 4`) === 0, 'Anciano A: ve pero no edita salidas de otros');
await como(8);
revisar(await n('registros_servicio') === 4, 'Ministerial A: también ve las salidas de A');

// 4) Admin Principal de A
await como(2);
revisar(await afecta(`INSERT INTO app_usuarios (nombre, usuario, password, rol, congregacion_id) VALUES ('Nuevo', 'nuevo_a', 'clave1', 'Publicador', '${A}')`) === 1, 'Admin A: crea usuarios en A');
revisar(!!(await falla(`INSERT INTO app_usuarios (nombre, usuario, password, rol, congregacion_id) VALUES ('X', 'nuevo_b', 'clave1', 'Publicador', '${B}')`)), 'Admin A: no crea usuarios en B');
revisar(!!(await falla(`INSERT INTO app_usuarios (nombre, usuario, password, rol, congregacion_id) VALUES ('X', 'nuevo_s', 'clave1', 'Super Admin', '${A}')`)), 'Admin A: no crea Super Admins');
revisar(await afecta(`UPDATE app_usuarios SET rol = 'Anciano', activo = false, password = 'reset9' WHERE id = 8`) === 1, 'Admin A: cambia rol, activo y contraseña de su gente');
revisar(/permiso/.test(await falla(`UPDATE app_usuarios SET rol = 'Super Admin' WHERE id = 4`) || ''), 'Admin A: no puede crear Super Admins por edición');
revisar(/permiso/.test(await falla(`UPDATE app_usuarios SET nombre = 'x' WHERE id = 1`) || ''), 'Admin A: no toca al Super Admin');
revisar(!!(await falla(`UPDATE app_usuarios SET congregacion_id = '${B}' WHERE id = 4`)), 'Admin A: no manda gente a otra congregación');
revisar(await afecta(`DELETE FROM app_usuarios WHERE id = 1`) === 0, 'Admin A: no borra al Super Admin');
await db.exec('RESET ROLE');
revisar(Number((await filas(`SELECT verificar_password('reset9', NULL, 8) id`))[0].id) === 8, 'la contraseña que puso el admin quedó cifrada y sirve');

// 5) Super Admin y desactivado
await como(1);
revisar(await n('congregaciones') === 2 && await n('casas') === 4 && await n('app_usuarios') === 9, 'Super Admin: ve todas las congregaciones');
revisar(await afecta(`UPDATE app_usuarios SET congregacion_id = '${B}', grupo_id = NULL WHERE id = 7`) === 1, 'Super Admin: puede mover usuarios de congregación');
await como(7);
revisar(TABLAS.every(Boolean) && await n('casas') === 0 && await n('app_usuarios') === 0, 'usuario desactivado (con token vigente): no ve nada');
await como(8);
revisar(await n('casas') === 0, 'usuario recién desactivado por el admin: deja de ver al instante');

// 6) Token con usuario_id basura
await db.exec('RESET ROLE');
await db.query(`SELECT set_config('request.jwt.claims', '{"role":"anon","usuario_id":"1 OR 1=1"}', false)`);
await db.exec('SET ROLE anon');
revisar(await n('casas') === 0, 'token con usuario_id raro: no ve nada (sin errores)');

// 7) Service role / SQL Editor: sin restricciones del disparador
await db.exec('RESET ROLE');
revisar(await afecta(`UPDATE app_usuarios SET rol = 'Anciano' WHERE id = 4`) === 1, 'SQL Editor / Edge Functions: pueden todo');

// 8) Revertir
await db.exec(leer('MIGRACION_12_REVERTIR.sql'));
await como(null);
revisar(await n('casas') === 4 && (await filas(`SELECT * FROM app_usuarios`)).length === 9, 'revertir: todo abierto como antes (select * vuelve a funcionar)');
await db.exec('RESET ROLE');
revisar((await filas(`SELECT valor FROM seguridad_config WHERE clave = 'blindaje'`))[0].valor === 'no', 'revertir: la app deja de exigir token');
// 9) Volver a blindar
await db.exec(sql12);
await como(null);
revisar(await n('casas') === 0, 'volver a blindar después de revertir: funciona');
await db.exec('RESET ROLE');

// ── Migración 13: Storage + intentos de login ──
const sql13 = leer('MIGRACION_13_SEGURIDAD.sql');
await db.exec('RESET ROLE');
let r13 = await db.exec(sql13);
r13 = await db.exec(sql13); // re-ejecutable
const rep13 = r13[r13.length - 1].rows[0];
revisar(Number(rep13.politicas_storage) === 7 && Number(rep13.candados) === 4, `M13 reporte: ${JSON.stringify(rep13)}`);
const pols = (await filas(`SELECT policyname FROM pg_policies WHERE schemaname='storage' ORDER BY 1`)).map(x => x.policyname);
revisar(!pols.includes('fotos abiertas') && !pols.includes('allow_upload_notas_voz') && pols.includes('otra app sube'), `M13: quitó las políticas abiertas de nuestros buckets y dejó la de la otra app (${pols.join(', ')})`);
const bk = await filas(`SELECT id, file_size_limit FROM storage.buckets ORDER BY id`);
revisar(Number(bk.find(b => b.id === 'fotos_casas').file_size_limit) === 10485760 && bk.find(b => b.id === 'otra_app').file_size_limit === null, 'M13: límite de tamaño solo en nuestros buckets');
await como(null);
revisar(!!(await falla(`INSERT INTO storage.objects (bucket_id, name) VALUES ('fotos_casas', 'hack.jpg')`)), 'Storage sin sesión: NO puede subir fotos');
revisar(!!(await falla(`INSERT INTO storage.objects (bucket_id, name) VALUES ('notas_voz', 'hack.webm')`)), 'Storage sin sesión: NO puede subir notas de voz');
revisar(await afecta(`DELETE FROM storage.objects WHERE bucket_id = 'fotos_casas'`) === 0, 'Storage sin sesión: NO puede borrar');
revisar(await afecta(`INSERT INTO storage.objects (bucket_id, name) VALUES ('otra_app', 'y.png')`) === 1, 'Storage: la otra app sigue igual');
await como(4);
revisar(await afecta(`INSERT INTO storage.objects (bucket_id, name) VALUES ('fotos_casas', 'nueva.jpg')`) === 1 && await afecta(`INSERT INTO storage.objects (bucket_id, name) VALUES ('notas_voz', 'n.webm')`) === 1, 'Storage con sesión (publicador): sube fotos y notas');
revisar(await afecta(`DELETE FROM storage.objects WHERE bucket_id = 'fotos_casas'`) === 0, 'Storage publicador: no borra archivos');
await como(5);
revisar(await afecta(`INSERT INTO storage.objects (bucket_id, name) VALUES ('fotos_casas', 'b.jpg')`) === 1, 'Storage otra congregación con sesión: también sube (los archivos no son por congregación)');
await como(2);
revisar(await afecta(`DELETE FROM storage.objects WHERE name = 'nueva.jpg'`) === 1, 'Storage Admin Principal: puede borrar (limpiezas)');
await como(null);
revisar(!!(await falla(`SELECT * FROM login_intentos`)), 'login_intentos: la app no la puede leer');
await db.exec('RESET ROLE');
await db.exec(leer('MIGRACION_13_REVERTIR.sql'));
await como(null);
revisar(await afecta(`INSERT INTO storage.objects (bucket_id, name) VALUES ('fotos_casas', 'abierto.jpg')`) === 1, 'M13 revertir: Storage abierto como antes');
await db.exec('RESET ROLE');


// ── Migración 14: bucket de respaldos + errores de la app ──
await db.exec('RESET ROLE');
await db.exec(`CREATE POLICY "Lectura pública de fotos" ON storage.objects FOR SELECT USING (true);`);
const sql14 = leer('MIGRACION_14_RESPALDOS_ERRORES.sql');
await db.exec(sql14);
const r14 = await db.exec(sql14);
const rep14 = r14[r14.length - 1].rows[0];
revisar(rep14.respaldos_publico_debe_ser_false === false && Number(rep14.candado_respaldos) === 1, `M14 reporte: ${JSON.stringify(rep14)}`);
await db.exec(`INSERT INTO storage.objects (bucket_id, name) VALUES ('respaldos', 'respaldo_2026-11-01_0300.json.gz')`); // como la Edge Function (service role)
await como(null);
revisar(await n('storage.objects WHERE bucket_id = \'respaldos\'') === 0, 'respaldos: sin sesión no se ven (aunque "Lectura pública" diga true)');
revisar(!!(await falla(`INSERT INTO storage.objects (bucket_id, name) VALUES ('respaldos', 'x.gz')`)), 'respaldos: sin sesión no se suben');
await como(1);
revisar(await n('storage.objects WHERE bucket_id = \'respaldos\'') === 0 && await afecta(`DELETE FROM storage.objects WHERE bucket_id = 'respaldos'`) === 0, 'respaldos: ni el Super Admin desde la app (solo la función del servidor)');
revisar(await n('storage.objects WHERE bucket_id = \'otra_app\'') >= 1, 'respaldos: el candado no afecta a la otra app');
// reportar_error
await como(null);
await db.query(`SELECT reportar_error('eabc123', 'Fallo sin sesión', 'pila', '/login', 'Edge', 'v1')`);
await como(4);
await db.query(`SELECT reportar_error('edef456', $1, 'pila', '/informes', 'Chrome', 'v1')`, ['x'.repeat(900)]);
await db.query(`SELECT reportar_error('edef456', 'otra vez', 'pila', '/informes', 'Chrome', 'v2')`);
await db.query(`SELECT reportar_error('MAL FIRMA!', 'x')`);
revisar(!!(await falla(`INSERT INTO errores_app (firma, mensaje) VALUES ('ezzz', 'directo')`)), 'errores: la app no puede insertar directo (solo por reportar_error)');
revisar(await n('errores_app') === 0, 'errores: un publicador no los puede ver');
await como(1);
const errs = await filas(`SELECT firma, length(mensaje) l, veces, usuario_id, version, congregacion_id FROM errores_app ORDER BY firma`);
revisar(errs.length === 2 && errs[0].usuario_id === null && Number(errs[1].usuario_id) === 4 && errs[1].veces === 2 && errs[1].l === 500 && errs[1].version === 'v2' && errs[1].congregacion_id, `errores: agrupados, recortados y con quién (${JSON.stringify(errs)})`);
revisar(await afecta(`UPDATE errores_app SET resuelto = true WHERE firma = 'edef456'`) === 1, 'errores: Super Admin marca resuelto');
revisar(!!(await falla(`UPDATE errores_app SET mensaje = 'editado'`)), 'errores: nadie puede editar el mensaje');
await como(4);
await db.query(`SELECT reportar_error('edef456', 'vuelve a pasar', NULL, '/informes', NULL, 'v3')`);
await como(1);
revisar((await filas(`SELECT resuelto, veces FROM errores_app WHERE firma = 'edef456'`))[0].resuelto === false, 'errores: si vuelve a pasar, se reabre');
await db.exec('RESET ROLE');
await db.exec(`INSERT INTO errores_app (firma, mensaje) SELECT 'ex' || g, 'm' FROM generate_series(1, 300) g`);
await como(null);
await db.query(`SELECT reportar_error('enuevo999', 'uno más')`);
await db.exec('RESET ROLE');
revisar(Number((await filas(`SELECT count(*) n FROM errores_app WHERE firma = 'enuevo999'`))[0].n) === 0, 'errores: tope de 300 distintos por día (contra abusos)');


// ── Migración 15: datos del S-21 (personales) ──
await db.exec('RESET ROLE');
const sql15 = leer('MIGRACION_15_REGISTRO_S21.sql');
await db.exec(sql15);
await db.exec(sql15); // re-ejecutable
await db.exec(`UPDATE app_usuarios SET rol = 'Publicador' WHERE id = 4`); // (una prueba de arriba lo hizo Anciano)
await como(3); // Anciano de A (el secretario)
revisar(await afecta(`INSERT INTO publicador_registro (usuario_id, sexo, fecha_nacimiento, esperanza) VALUES (4, 'Mujer', '1990-02-03', 'Otras ovejas')`) === 1, 'S-21: el anciano (secretario) captura los datos de alguien de su congregación');
revisar(!!(await falla(`INSERT INTO publicador_registro (usuario_id, sexo) VALUES (5, 'Hombre')`)), 'S-21: el anciano NO captura datos de otra congregación');
revisar(await afecta(`UPDATE publicador_registro SET fecha_bautismo = '2004-06-07' WHERE usuario_id = 4`) === 1, 'S-21: el anciano corrige datos');
revisar(Number((await filas(`SELECT actualizado_por FROM publicador_registro WHERE usuario_id = 4`))[0].actualizado_por) === 3, 'S-21: queda quién lo cambió (lo pone la BD)');
await db.exec('RESET ROLE');
await db.exec(`INSERT INTO publicador_registro (usuario_id, sexo) VALUES (5, 'Hombre'), (2, 'Hombre') ON CONFLICT DO NOTHING`);
await como(4); // publicador de A
revisar(await n('publicador_registro') === 1 && Number((await filas(`SELECT usuario_id FROM publicador_registro`))[0].usuario_id) === 4, 'S-21: el publicador solo ve SUS datos (no los de los demás)');
revisar(await afecta(`UPDATE publicador_registro SET sexo = 'Hombre' WHERE usuario_id = 4`) === 0, 'S-21: el publicador no puede cambiar sus datos (solo el secretario)');
await como(6); // Admin de B
revisar(await n('publicador_registro WHERE usuario_id = 4') === 0 && await n('publicador_registro WHERE usuario_id = 5') === 1, 'S-21: otra congregación no ve los datos de A');
await como(null);
revisar(await n('publicador_registro') === 0, 'S-21: sin sesión, nada');
await como(1);
revisar(await n('publicador_registro') === 3, 'S-21: Super Admin ve todos');
await db.exec('RESET ROLE');


// ── Migración 16: bitácora de recordatorios ──
await db.exec('RESET ROLE');
const sql16 = leer('MIGRACION_16_RECORDATORIOS.sql');
await db.exec(sql16);
await db.exec(sql16); // re-ejecutable
await db.exec(`INSERT INTO recordatorios_enviados (clave, usuario_id) VALUES ('turno:1', 3)`);
await como(1);
revisar(!!(await falla(`SELECT * FROM recordatorios_enviados`)) && !!(await falla(`INSERT INTO recordatorios_enviados (clave) VALUES ('x')`)), 'recordatorios: ni el Super Admin desde la app lee o escribe la bitácora (solo la función)');
await db.exec('RESET ROLE');


// ── Migración 17: aseo del Salón por grupos ──
await db.exec('RESET ROLE');
const sql17 = leer('MIGRACION_17_ASEO.sql');
await db.exec(sql17);
await db.exec(sql17); // re-ejecutable
revisar(true, 'aseo: la Migración 17 se puede correr dos veces');
await db.exec(`INSERT INTO grupos_predicacion (id, congregacion_id, nombre) VALUES (3, '${A}', 'G-A2'), (4, '${A}', 'G-A3') ON CONFLICT DO NOTHING`);
await db.exec(`UPDATE app_usuarios SET rol = 'Publicador' WHERE id = 4; UPDATE app_usuarios SET rol = 'Ministerial', activo = true WHERE id = 8`);
await como(4);
revisar(!!(await falla(`INSERT INTO aseo_planes (congregacion_id, reuniones, orden_grupos) VALUES ('${A}', '[]', '{1}')`)), 'aseo: un publicador no puede planear');
await como(8); // Ministerial de A
revisar(await afecta(`INSERT INTO aseo_planes (congregacion_id, reuniones, orden_grupos, inicio) VALUES ('${A}', '[{"dia":4,"hora":"19:30"},{"dia":0,"hora":"10:00"}]', '{3,1,4}', '2026-11-05')`) === 1, 'aseo: el ministerial planea su congregación');
let pl = (await filas(`SELECT inicio::text, actualizado_por FROM aseo_planes WHERE congregacion_id = '${A}'`))[0];
revisar(pl.inicio === '2026-11-02' && Number(pl.actualizado_por) === 8, `aseo: la semana empieza en lunes (${pl.inicio}) y queda quién lo planeó`);
revisar(/otra congregación/.test(await falla(`UPDATE aseo_planes SET orden_grupos = '{1,2}' WHERE congregacion_id = '${A}'`) || ''), 'aseo: no deja meter un grupo de otra congregación en la rotación');
revisar(!!(await falla(`INSERT INTO aseo_planes (congregacion_id, orden_grupos) VALUES ('${B}', '{2}')`)), 'aseo: no puede planear otra congregación');
revisar(!!(await falla(`UPDATE aseo_planes SET reuniones = '{"dia":4}' WHERE congregacion_id = '${A}'`)), 'aseo: reuniones tiene que ser una lista');
revisar(await afecta(`INSERT INTO aseo_cambios (congregacion_id, semana, sin_aseo, nota) VALUES ('${A}', '2026-11-18', true, 'Asamblea')`) === 1, 'aseo: cambio de una semana (sin aseo)');
revisar((await filas(`SELECT semana::text s FROM aseo_cambios`))[0].s === '2026-11-16', 'aseo: el cambio se guarda en el lunes de esa semana');
revisar(/otra congregación/.test(await falla(`INSERT INTO aseo_cambios (congregacion_id, semana, grupo_id) VALUES ('${A}', '2026-11-23', 2)`) || ''), 'aseo: cambio con grupo de otra congregación → rechazado');
revisar(!!(await falla(`INSERT INTO aseo_cambios (congregacion_id, semana, sin_aseo) VALUES ('${A}', '2026-11-17', true)`)), 'aseo: un solo cambio por semana');
revisar(await afecta(`INSERT INTO aseo_cambios (congregacion_id, semana, grupo_id) VALUES ('${A}', '2026-11-17', 1) ON CONFLICT (congregacion_id, semana) DO UPDATE SET grupo_id = 1, sin_aseo = false`) === 1, 'aseo: el cambio se puede reemplazar (upsert)');
await como(4);
revisar(await n('aseo_planes') === 1 && await n('aseo_cambios') === 1, 'aseo: el publicador VE la planeación de su congregación');
revisar(await afecta(`UPDATE aseo_planes SET avisos = false`) === 0 && await afecta(`DELETE FROM aseo_cambios`) === 0, 'aseo: el publicador no la cambia');
await como(6); // Admin de B
revisar(await n('aseo_planes') === 0 && await n('aseo_cambios') === 0, 'aseo: otra congregación no ve la planeación de A');
revisar(await afecta(`INSERT INTO aseo_planes (congregacion_id, orden_grupos) VALUES ('${B}', '{2}')`) === 1, 'aseo: el admin de B planea la suya');
await como(null);
revisar(await n('aseo_planes') === 0, 'aseo: sin sesión, nada');
await db.exec('RESET ROLE');
await db.exec(`DELETE FROM grupos_predicacion WHERE id = 4`);
await como(3); // Anciano de A
revisar(await afecta(`UPDATE aseo_planes SET avisos = false WHERE congregacion_id = '${A}'`) === 1, 'aseo: si borran un grupo, la planeación no se traba');
revisar((await filas(`SELECT orden_grupos::text o FROM aseo_planes WHERE congregacion_id = '${A}'`))[0].o === '{3,1}', 'aseo: el grupo borrado sale de la rotación (el orden de los demás se queda)');
await como(1);
revisar(await n('aseo_planes') === 2, 'aseo: Super Admin ve todas');
await db.exec('RESET ROLE');


console.log('OK (' + ok.length + '):\n- ' + ok.join('\n- '));
console.log('\nFALLOS:\n- ' + (fallo.join('\n- ') || '(ninguno)'));
process.exitCode = fallo.length ? 1 : 0;
