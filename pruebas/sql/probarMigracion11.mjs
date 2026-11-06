// Corre MIGRACION_11 y 11B reales en Postgres (PGlite + pgcrypto) y revisa todo el ciclo.
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';

const RAIZ = process.argv[2];
const sql11 = fs.readFileSync(`${RAIZ}/MIGRACION_11_PASSWORDS.sql`, 'utf8');
const sql11b = fs.readFileSync(`${RAIZ}/MIGRACION_11B_SIN_TEXTO_PLANO.sql`, 'utf8');
const ok = [], fallo = [];
const revisar = (c, t) => (c ? ok : fallo).push(t);

const db = new PGlite({ extensions: { pgcrypto } });
// Entorno parecido a Supabase
await db.exec(`
  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE TABLE app_usuarios (
    id BIGSERIAL PRIMARY KEY, nombre TEXT, usuario TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
    rol TEXT, activo BOOLEAN DEFAULT true, grupo_id BIGINT, created_at TIMESTAMPTZ DEFAULT now()
  );
  GRANT ALL ON app_usuarios TO anon, authenticated, service_role;
  GRANT USAGE ON SEQUENCE app_usuarios_id_seq TO anon;
  INSERT INTO app_usuarios (nombre, usuario, password, rol) VALUES
    ('Daniel', 'dani', '1234', 'Anciano'), ('Ana', 'ana', 'secreta', 'Publicador'), ('Vacío', 'vacio', '', 'Publicador');
`);
const q = async (s, p) => (await db.query(s, p)).rows;
const verificar = async (pw, usuario = null, id = null) => (await q('SELECT verificar_password($1, $2, $3) AS id', [pw, usuario, id]))[0].id;
// pgrst NOTIFY no existe en PGlite como canal de PostgREST, pero NOTIFY sí funciona

// ── Fase 1 (dos veces: re-ejecutable) ──
await db.exec(sql11);
await db.exec(sql11);
let filas = await q('SELECT usuario, password, password_hash FROM app_usuarios ORDER BY id');
revisar(filas[0].password === '1234' && /^\$2[abxy]\$10\$/.test(filas[0].password_hash), `fase 1: dani conserva la original y tiene hash bcrypt (${filas[0].password_hash?.slice(0, 7)})`);
revisar(filas[2].password_hash === null, 'fase 1: contraseña vacía no se cifra');
revisar(Number(await verificar('1234', 'dani')) === 1, 'verificar por usuario: correcta');
revisar(await verificar('mala', 'dani') === null, 'verificar: incorrecta → null');
revisar(Number(await verificar('secreta', null, 2)) === 2, 'verificar por id: correcta');
revisar(await verificar('', 'vacio') === null, 'verificar: contraseña vacía nunca entra');
revisar(await verificar('1234', null, null) === null, 'verificar: sin usuario ni id → null');
revisar(await verificar('1234', 'ana') === null, 'verificar: contraseña de otro usuario no sirve');

// La app de siempre (anon) sigue igual: alta y cambio de contraseña se cifran solos
await db.exec(`SET ROLE anon`);
await db.exec(`INSERT INTO app_usuarios (nombre, usuario, password, rol) VALUES ('Beto', 'beto', 'b3to', 'Publicador')`);
await db.exec(`UPDATE app_usuarios SET password = 'nueva1' WHERE usuario = 'ana'`);
await db.exec(`UPDATE app_usuarios SET grupo_id = 5 WHERE usuario = 'dani'`); // otro campo: no recalcula
let denegado = false;
try { await q(`SELECT verificar_password('1234', 'dani')`); } catch (e) { denegado = /permission denied/i.test(e.message); }
revisar(denegado, 'anon NO puede llamar verificar_password');
let denegado2 = false;
try { await q(`SELECT * FROM seguridad_config`); } catch (e) { denegado2 = /permission denied/i.test(e.message); }
revisar(denegado2, 'anon NO puede leer seguridad_config');
await db.exec(`RESET ROLE`);
const hashDaniAntes = filas[0].password_hash;
filas = await q('SELECT usuario, password, password_hash FROM app_usuarios ORDER BY id');
revisar(Number(await verificar('b3to', 'beto')) > 0 && filas.find(f => f.usuario === 'beto').password === 'b3to', 'alta desde la app: cifrada y conserva la original (fase 1)');
revisar(Number(await verificar('nueva1', 'ana')) === 2 && await verificar('secreta', 'ana') === null, 'cambio de contraseña: la nueva entra, la vieja no');
revisar(filas[0].password_hash === hashDaniAntes, 'actualizar otro campo no recalcula el hash');

// Un respaldo restaurado (trae password + password_hash de una fila ya cifrada)
await db.exec(`INSERT INTO app_usuarios (nombre, usuario, password, password_hash) VALUES ('Res', 'res', NULL, '${hashDaniAntes}')`);
revisar(Number(await verificar('1234', 'res')) > 0, 'respaldo con solo hash: entra con su contraseña');

// Hash con escape $ en la consulta anterior fue literal; ahora: fase 1 en usuario sin hash (borrado a mano)
await db.exec(`UPDATE app_usuarios SET password_hash = NULL WHERE usuario = 'beto'`);
// El disparador lo vuelve a calcular porque quedó sin hash al tocar la fila
filas = await q(`SELECT password_hash FROM app_usuarios WHERE usuario = 'beto'`);
revisar(filas[0].password_hash !== null, 'si alguien borra el hash, el disparador lo recalcula');
revisar(Number(await verificar('b3to', 'beto')) > 0, 'sin hash: se compara con la original (transición)');

// ── Fase 2 (dos veces) ──
await db.exec(sql11b);
const r2 = await db.exec(sql11b);
const conteo = r2[r2.length - 1].rows[0];
revisar(Number(conteo.con_texto_plano) === 0, `fase 2: 0 con texto plano (${JSON.stringify(conteo)})`);
filas = await q('SELECT usuario, password, password_hash FROM app_usuarios ORDER BY id');
revisar(filas.every(f => f.password === null), 'fase 2: ninguna contraseña legible');
revisar(Number(await verificar('1234', 'dani')) === 1 && Number(await verificar('nueva1', 'ana')) === 2 && Number(await verificar('b3to', 'beto')) > 0, 'fase 2: todos siguen entrando (incluido beto, cifrado al último momento)');
revisar(await verificar('', 'vacio') === null, 'fase 2: la cuenta sin contraseña sigue sin entrar');

// Después de la fase 2: alta y cambio desde la app → solo cifrado
await db.exec(`SET ROLE anon`);
await db.exec(`INSERT INTO app_usuarios (nombre, usuario, password) VALUES ('Carla', 'carla', 'c4rla')`);
await db.exec(`UPDATE app_usuarios SET password = 'otra' WHERE usuario = 'dani'`);
await db.exec(`UPDATE app_usuarios SET nombre = 'Dani A.' WHERE usuario = 'dani'`); // sin password: no borra el hash
await db.exec(`RESET ROLE`);
filas = await q(`SELECT usuario, password, password_hash FROM app_usuarios WHERE usuario IN ('carla','dani') ORDER BY usuario`);
revisar(filas.every(f => f.password === null && f.password_hash), 'fase 2: alta y cambio quedan solo cifrados');
revisar(Number(await verificar('c4rla', 'carla')) > 0 && Number(await verificar('otra', 'dani')) === 1 && await verificar('1234', 'dani') === null, 'fase 2: contraseñas nuevas entran, la vieja no');

// Re-correr la fase 1 después de la fase 2 no rompe nada
await db.exec(sql11);
revisar(Number(await verificar('otra', 'dani')) === 1 && (await q(`SELECT count(*)::int n FROM app_usuarios WHERE password IS NOT NULL`))[0].n === 0, 're-correr la 11 después de la 11B: todo igual');

console.log('OK:\n- ' + ok.join('\n- '));
console.log('\nFALLOS:\n- ' + (fallo.join('\n- ') || '(ninguno)'));
process.exitCode = fallo.length ? 1 : 0;
