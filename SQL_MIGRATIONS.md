# SQL Migrations — Gestión Territorial JW

> **Instrucciones para el cliente:**
> Ejecutar cada bloque SQL manualmente en el **Supabase Dashboard**:
> `Project → SQL Editor → New query → pegar el SQL → Run`
>
> Ejecutar las migraciones en el orden indicado (1, 2, 3...).

---

## Migración 1 — Historial de Visitas

Registra cada cambio de estado de una casa, con el usuario que realizó el cambio y notas opcionales.

```sql
CREATE TABLE historial_visitas (
  id            BIGSERIAL PRIMARY KEY,
  casa_id       BIGINT REFERENCES casas(id) ON DELETE CASCADE,
  usuario_id    BIGINT REFERENCES app_usuarios(id) ON DELETE SET NULL,
  usuario_nombre TEXT,
  estado_anterior TEXT,
  estado_nuevo   TEXT,
  notas          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_historial_casa ON historial_visitas(casa_id);
```

**Notas:**
- `casa_id`: al eliminar una casa, su historial se elimina en cascada.
- `usuario_id`: si el usuario es eliminado, el campo queda en NULL pero el registro se conserva.
- `usuario_nombre`: se guarda al momento del registro para preservar el nombre aunque el usuario cambie.

---

## Migración 2 — Asignaciones de Territorios

Registra qué publicadores tienen asignado cada territorio, con fechas de inicio/fin y estado activo.

```sql
CREATE TABLE territorio_asignaciones (
  id             BIGSERIAL PRIMARY KEY,
  territorio_id  BIGINT REFERENCES territorios(id) ON DELETE CASCADE,
  usuario_id     BIGINT REFERENCES app_usuarios(id) ON DELETE CASCADE,
  asignado_por   BIGINT REFERENCES app_usuarios(id) ON DELETE SET NULL,
  fecha_inicio   DATE DEFAULT CURRENT_DATE,
  fecha_fin      DATE,
  activa         BOOLEAN DEFAULT TRUE,
  notas          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_asig_territorio ON territorio_asignaciones(territorio_id);
CREATE INDEX idx_asig_usuario ON territorio_asignaciones(usuario_id);
```

**Notas:**
- `territorio_id`: al eliminar un territorio, sus asignaciones se eliminan en cascada.
- `usuario_id`: al eliminar un usuario, sus asignaciones se eliminan en cascada.
- `asignado_por`: si el usuario que asignó es eliminado, el campo queda en NULL pero el registro se conserva.
- `activa`: usar `false` + `fecha_fin` para desasignar sin perder el historial.
- Para desasignar: `UPDATE territorio_asignaciones SET activa = false, fecha_fin = CURRENT_DATE WHERE id = [id];`

---

## Migración 3 — Notificaciones Internas

Almacena notificaciones in-app para cada usuario: asignaciones, cambios de estado, alertas del sistema.

```sql
CREATE TABLE notificaciones (
  id                   BIGSERIAL PRIMARY KEY,
  usuario_destino_id   BIGINT REFERENCES app_usuarios(id) ON DELETE CASCADE,
  tipo                 TEXT NOT NULL CHECK (tipo IN ('asignacion', 'estado_casa', 'sistema', 'alerta')),
  titulo               TEXT NOT NULL,
  mensaje              TEXT,
  leida                BOOLEAN DEFAULT FALSE,
  metadata             JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notif_usuario ON notificaciones(usuario_destino_id);
CREATE INDEX idx_notif_leida   ON notificaciones(usuario_destino_id, leida);
```

**Notas:**
- `usuario_destino_id`: al eliminar un usuario, sus notificaciones se eliminan en cascada.
- `tipo`: valores permitidos: `'asignacion'`, `'estado_casa'`, `'sistema'`, `'alerta'`.
- `metadata`: campo JSONB libre para datos extra (ej. `{"casa_id": 42, "territorio_id": 7}`).
- `leida`: usar `false` para no leídas; el badge de la campana muestra el conteo de registros con `leida = false`.

**RLS sugerida (Row Level Security):**

```sql
-- Habilitar RLS en la tabla
ALTER TABLE notificaciones ENABLE ROW LEVEL SECURITY;

-- Política: cada usuario solo puede ver sus propias notificaciones
CREATE POLICY "usuarios_ven_sus_notificaciones"
  ON notificaciones FOR SELECT
  USING (usuario_destino_id = auth.uid()::bigint);

-- Política: solo el sistema (service_role) puede insertar notificaciones
-- Las inserciones desde el frontend deben hacerse con el cliente de servicio,
-- o bien agregar una política INSERT para roles de admin si se insertan desde el cliente.
```

> **Nota sobre RLS:** Si la app usa un cliente Supabase con `anon key` sin autenticación nativa de Supabase (auth custom), deshabilitar RLS en esta tabla y controlar el acceso a nivel de aplicación, o usar `service_role` key para inserciones desde Edge Functions / triggers.

---

## Migración 4 — Territorios Compartidos + Campo audio_url en Casas

### 4a — Tabla territorio_compartidos

Permite generar links temporales de solo lectura para compartir un territorio sin requerir login.

```sql
CREATE TABLE territorio_compartidos (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  territorio_id  BIGINT REFERENCES territorios(id) ON DELETE CASCADE,
  creado_por     BIGINT REFERENCES app_usuarios(id),
  expira_en      TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
```

**Notas:**
- `id`: UUID generado automáticamente — se usa como token del link (`/shared/{uuid}`).
- `territorio_id`: al eliminar un territorio, sus links compartidos se eliminan en cascada.
- `creado_por`: referencia al usuario que generó el link. Sin `ON DELETE CASCADE` para conservar el registro si el usuario es eliminado.
- `expira_en`: la app genera links con expiración de 24 horas. La página `/shared/:id` verifica este campo antes de mostrar el contenido.
- **El cliente debe ejecutar este SQL antes de activar la función "Compartir" en el mapa de territorios.**

**RLS sugerida:**

```sql
-- Permitir SELECT público (sin auth) para que funcione la página compartida
ALTER TABLE territorio_compartidos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lectura_publica_compartidos"
  ON territorio_compartidos FOR SELECT
  USING (true);

-- Solo usuarios autenticados (via app) pueden insertar
CREATE POLICY "insertar_compartidos_autenticados"
  ON territorio_compartidos FOR INSERT
  WITH CHECK (true);
```

---

### 4b — Campo audio_url en tabla casas

Agrega soporte para notas de voz grabadas por el publicador al registrar o editar una casa.

```sql
ALTER TABLE casas ADD COLUMN IF NOT EXISTS audio_url TEXT;
```

**Notas:**
- `audio_url`: URL del archivo de audio almacenado en el bucket `notas_voz` de Supabase Storage.
- El bucket `notas_voz` debe crearse manualmente en **Supabase Dashboard → Storage → New bucket**.
  - Nombre: `notas_voz`
  - Visibilidad: pública (para reproducción directa desde `<audio src>`) o privada con URLs firmadas.
- `IF NOT EXISTS` evita error si el campo ya fue agregado previamente.
- **El cliente debe ejecutar este SQL y crear el bucket antes de usar la función de notas de voz.**

---

## Migración 5 — Grupos de Predicación y Trabajo de Territorios por Grupo

Cada congregación se divide en grupos de predicación. Los territorios se asignan a un **grupo**
(no a una persona); el grupo lo trabaja y su encargado lo marca como **terminado**.
Con esto se calcula el progreso de cada territorio (Sin trabajar / En progreso / Completado).

> **Para ejecutarla:** copiar el archivo **`MIGRACION_5_GRUPOS.sql`** completo (no este `.md`)
> en Supabase → SQL Editor. Esa versión se puede correr más de una vez sin errores.

```sql
-- 5a. Grupos de predicación
CREATE TABLE IF NOT EXISTS grupos_predicacion (
  id              BIGSERIAL PRIMARY KEY,
  congregacion_id UUID REFERENCES congregaciones(id) ON DELETE CASCADE,
  nombre          TEXT NOT NULL,
  color           TEXT DEFAULT '#3B82F6',
  encargado_id    BIGINT REFERENCES app_usuarios(id) ON DELETE SET NULL,
  activo          BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_grupos_congregacion ON grupos_predicacion(congregacion_id);

-- 5b. Cada publicador pertenece a un grupo
ALTER TABLE app_usuarios
  ADD COLUMN IF NOT EXISTS grupo_id BIGINT REFERENCES grupos_predicacion(id) ON DELETE SET NULL;

-- 5c. Trabajo de un territorio por un grupo (un registro por cada vez que se trabaja)
CREATE TABLE IF NOT EXISTS territorio_trabajos (
  id              BIGSERIAL PRIMARY KEY,
  territorio_id   BIGINT REFERENCES territorios(id) ON DELETE CASCADE,
  grupo_id        BIGINT REFERENCES grupos_predicacion(id) ON DELETE SET NULL,
  congregacion_id UUID REFERENCES congregaciones(id) ON DELETE CASCADE,
  estado          TEXT NOT NULL DEFAULT 'en_progreso'
                  CHECK (estado IN ('en_progreso', 'completado', 'cancelado')),
  fecha_inicio    DATE DEFAULT CURRENT_DATE,
  fecha_fin       DATE,
  asignado_por    BIGINT REFERENCES app_usuarios(id) ON DELETE SET NULL,
  completado_por  BIGINT REFERENCES app_usuarios(id) ON DELETE SET NULL,
  notas           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_trabajos_territorio ON territorio_trabajos(territorio_id);
CREATE INDEX IF NOT EXISTS idx_trabajos_congregacion ON territorio_trabajos(congregacion_id);
-- Un territorio solo puede estar "en progreso" con un grupo a la vez
CREATE UNIQUE INDEX IF NOT EXISTS uniq_trabajo_activo
  ON territorio_trabajos(territorio_id) WHERE estado = 'en_progreso';

-- 5d. Tiempo real (para que el mapa y el progreso se actualicen solos)
ALTER PUBLICATION supabase_realtime ADD TABLE grupos_predicacion;
ALTER PUBLICATION supabase_realtime ADD TABLE territorio_trabajos;
ALTER PUBLICATION supabase_realtime ADD TABLE historial_visitas;
```

**Notas:**
- Si `ALTER PUBLICATION` marca que la tabla ya está en la publicación, ignorar ese error.
- RLS: igual que el resto de las tablas de la app (login propio, no Supabase Auth), se dejan **sin RLS**;
  el acceso se controla en la app por rol y congregación.
- `estado`:
  - `en_progreso` → el grupo lo está trabajando (el territorio sale "En progreso").
  - `completado` → el encargado lo marcó terminado; `fecha_fin` = fecha de término.
  - `cancelado` → se le quitó al grupo sin terminarlo (no cuenta como completado).
- El % de avance de un territorio en progreso cuenta las casas visitadas **desde `fecha_inicio`**
  (usa `historial_visitas` y la fecha de registro de la casa).
- Las asignaciones individuales (`territorio_asignaciones`, Migración 2) siguen funcionando, pero
  ya no se usan para el progreso.
- **Quién puede qué (en la app):** crear grupos y asignar territorios a grupos → Super Admin,
  Admin Principal, Anciano, Ministerial. Marcar terminado → esos roles o el encargado del grupo.

---

## Migración 7 — Informes de servicio (precursores y publicadores)

Cada usuario (de cualquier rol) es **Publicador**, **Precursor auxiliar** o **Precursor regular**.
Los precursores anotan cada salida (horas de predicación por tipo, revisitas, o servicio sagrado) y la
app arma el informe del mes y les muestra su avance contra su meta (mensual y, el regular, también del
año de servicio, septiembre–agosto). Los publicadores solo marcan "Prediqué este mes" y sus estudios.

> **Para ejecutarla:** copiar el archivo **`MIGRACION_7_INFORMES.sql`** completo en Supabase → SQL Editor.
> Se puede correr más de una vez sin errores. Mientras no se corra, la app sigue funcionando y la
> pantalla Informes avisa que falta.

```sql
-- (ver MIGRACION_7_INFORMES.sql)
-- 7a. app_usuarios: tipo_publicador ('Publicador' | 'Precursor auxiliar' | 'Precursor regular'),
--     meta_horas_mensual, meta_horas_anual
-- 7b. registros_servicio: una fila por salida
--     (usuario_id, congregacion_id, fecha, categoria 'predicacion'|'servicio_sagrado',
--      tipo 'casa_en_casa'|'cartas'|'telefono'|'exhibidor'|'informal'|'otro', horas, revisitas, notas)
-- 7c. informes_servicio: uno por usuario por mes (UNIQUE usuario_id, mes; mes = día 1)
--     (tipo_publicador del mes, predico, estudios, horas, revisitas, horas_servicio_sagrado,
--      comentarios, enviado_en)
```

**Notas:**
- RLS: igual que el resto (login propio), **sin RLS**; la app filtra por usuario y congregación.
- **Horas de predicación** = casa en casa + cartas + teléfono + exhibidor + informal. El **servicio
  sagrado** (aseo, mantenimiento, etc.) se guarda aparte y **no** suma a las horas de predicación.
- **Estudios bíblicos**: se escriben en el informe del mes (es cuántos estudios distintos se condujeron).
- `informes_servicio.tipo_publicador` guarda lo que la persona era ese mes (un auxiliar puede serlo solo
  algunos meses).
- Al enviar, el informe guarda los totales del mes; si después se agregan salidas, se vuelve a enviar.
- **Quién ve qué (en la app):** cada usuario su informe; Super Admin, Admin Principal, Anciano y
  Ministerial ven el resumen de su congregación (y exportan a Excel/PDF).

---

## Migración 8 — Punto de reunión en los links compartidos

Archivo listo para pegar: `MIGRACION_8_PUNTO_REUNION.sql` (re-ejecutable).

```sql
ALTER TABLE territorio_compartidos
  ADD COLUMN IF NOT EXISTS punto_reunion_lat  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS punto_reunion_lng  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS punto_reunion_nota TEXT;
-- + CHECK chk_punto_reunion_coords (los dos nulos o coordenadas válidas)
```

- Se llena desde el modal "Compartir Territorio" (opcional). Sin la migración la app sigue igual
  y al guardar el punto avisa que falta correr este archivo.
- Las ubicaciones en vivo del link compartido no usan tablas: Supabase Realtime (presencia),
  canal `compartido:<id del link>`; nada se guarda.

---

## Migración 9 — Actividad de la congregación (inactivos ajustable)

Archivo listo para pegar: `MIGRACION_9_ACTIVIDAD.sql` (re-ejecutable).

```sql
ALTER TABLE congregaciones
  ADD COLUMN IF NOT EXISTS meses_inactividad SMALLINT NOT NULL DEFAULT 3;
-- + CHECK chk_meses_inactividad (1 a 24)
CREATE INDEX IF NOT EXISTS idx_historial_usuario_fecha ON historial_visitas(usuario_id, created_at);
```

- Informes → pestaña "Actividad": inactivo = `meses_inactividad` meses completos sin actividad (informe con
  "Prediqué", horas de predicación o visitas en el mapa). Lo ajustan Anciano, Admin Principal y Super Admin.
- Sin la migración la pestaña funciona igual con 3 meses y el ajuste se guarda solo en ese dispositivo.

---

## Migración 10 — Entrar con huella / Face ID (WebAuthn)

Archivo listo para pegar: `MIGRACION_10_WEBAUTHN.sql` (re-ejecutable). Además hay que desplegar la
Edge Function `webauthn` (pasos en `docs/ENTRAR_CON_HUELLA.md`).

```sql
CREATE TABLE IF NOT EXISTS webauthn_credenciales (
  id BIGSERIAL PRIMARY KEY,
  usuario_id BIGINT NOT NULL REFERENCES app_usuarios(id) ON DELETE CASCADE,
  credencial_id TEXT NOT NULL UNIQUE, llave_publica TEXT NOT NULL, contador BIGINT NOT NULL DEFAULT 0,
  transportes TEXT[], dispositivo TEXT, creado_en TIMESTAMPTZ NOT NULL DEFAULT now(), usado_en TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS webauthn_retos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), reto TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('registro', 'login')),
  usuario_id BIGINT REFERENCES app_usuarios(id) ON DELETE CASCADE,
  expira_en TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '5 minutes'
);
-- RLS activado SIN políticas + REVOKE a anon/authenticated: solo la Edge Function (service role) las usa
```

- Solo se guarda la llave **pública**; la huella nunca sale del teléfono.
- Sin la migración (o sin la función) la app no muestra el botón de huella y todo sigue igual.

---

## Migración 11 — Contraseñas cifradas (bcrypt) — en dos fases

Archivos listos para pegar (re-ejecutables), **en este orden y no el mismo día**:

1. `MIGRACION_11_PASSWORDS.sql` — fase 1: `app_usuarios.password_hash` (bcrypt con `pgcrypto`), disparador
   `trg_app_usuarios_cifrar_password` (cifra toda contraseña que se escriba: alta, cambio, respaldo) y la función
   `verificar_password(p_password, p_usuario, p_id)` (solo `service_role`; la usan las Edge Functions `sesion` y
   `webauthn`). La columna `password` original se conserva: todo sigue funcionando igual.
2. `MIGRACION_11B_SIN_TEXTO_PLANO.sql` — fase 2: marca `seguridad_config.borrar_password_plano = 'si'` y borra el
   texto plano. Desde ahí nadie puede ver contraseñas (en Usuarios salen "Cifrada"), solo cambiarlas.
   **Antes:** app nueva publicada + funciones `sesion` y `webauthn` con el código nuevo + probar entrar y
   cambiar contraseña.

```sql
ALTER TABLE app_usuarios ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE app_usuarios ALTER COLUMN password DROP NOT NULL;
CREATE TABLE IF NOT EXISTS seguridad_config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL); -- RLS sin políticas
-- + disparador app_usuarios_cifrar_password() y función verificar_password(...) (ver el .sql)
```

---

## Migración 12 — Blindaje: permisos por congregación (RLS)

Archivo: `MIGRACION_12_BLINDAJE.sql` (re-ejecutable). Para deshacerla: `MIGRACION_12_REVERTIR.sql`.
Pasos completos y orden: `docs/SESION_SEGURA.md` (paso 3). Probada contra el esquema real (diagnóstico
`DIAGNOSTICO_BLINDAJE.sql`) en Postgres: 70 casos (sin sesión, por rol, entre congregaciones, revertir).

- **El proyecto de Supabase lo comparten otras apps**: la migración solo toca, por nombre, las 16 tablas de la app.
- Quién eres: `jw_usuario_id()` (claim `usuario_id` del token firmado); `jw_rol()` / `jw_congregacion()` se leen de
  `app_usuarios` (cuenta desactivada = sin acceso al instante). `jw_mis_territorios()`, `jw_mis_casas()`, `jw_mis_usuarios()`.
- Políticas `jw_*`: todo por congregación (Super Admin ve todas); casas/manzanas/asignaciones/compartidos por territorio;
  historial por casa; notificaciones las tuyas (puedes mandar a tu congregación); salidas e informes los tuyos, y
  Admin Principal/Anciano/Ministerial ven los de su congregación; congregaciones: editar Admin Principal/Anciano.
- `app_usuarios`: altas/bajas solo admins; disparador `trg_app_usuarios_proteger` limita qué columnas cambia cada rol;
  la app **no puede leer** `password` ni `password_hash` (permisos por columna) → nunca `select('*')` ahí.
- Link compartido sin sesión: `compartido_datos(p_id)` (solo ese territorio y solo si está vigente).
- Rellena `congregacion_id` vacío donde se puede deducir y al final muestra un reporte.
- `seguridad_config.blindaje = 'si'`: la app exige sesión con token.

---

## Migración 13 — Seguridad: Storage y límite de intentos de login

Archivo: `MIGRACION_13_SEGURIDAD.sql` (re-ejecutable; trae sus propias funciones `jw_*`, funciona con o sin la 12). Deshacer: `MIGRACION_13_REVERTIR.sql`.

- Buckets `fotos_casas` (máx. 10 MB, solo imágenes) y `notas_voz` (máx. 15 MB): siguen **públicos para ver**
  (los links guardados no cambian y el link compartido muestra las fotos), pero **subir** exige sesión
  firmada de cuenta activa (`jw_storage_subir`), listar también, y **borrar** solo Super Admin/Admin Principal.
  Solo se quitan las políticas viejas de esos dos buckets (el proyecto lo comparten otras apps). Además, 4
  **candados restrictivos** (`jw_storage_candado_*`, AS RESTRICTIVE) neutralizan para esos buckets las políticas
  abiertas de otras apps que aplican a todos los buckets, sin tocarlas.
- `login_intentos` (RLS sin políticas): las funciones `sesion` y `webauthn` bloquean 15 min tras 5 fallos por
  usuario (o 20 por IP). Sin la tabla no se limita nada.
- El reporte final dice cuántas contraseñas siguen en texto plano (si no es 0, falta correr la 11B).

---

## Migración 14 — Respaldos automáticos y errores de la app

Archivos: `MIGRACION_14_RESPALDOS_ERRORES.sql` (re-ejecutable) y `MIGRACION_14B_PROGRAMAR_RESPALDO.sql`
(pg_cron + pg_net; cambiar la URL y el secreto). Edge Function `supabase/functions/respaldo`. Pasos: `docs/RESPALDOS.md`.

- Bucket privado `respaldos` con candado **restrictivo** `jw_respaldos_candado`: nadie desde la app (ni usuarios de
  otras apps) lo lista, baja, sube ni borra; solo la función (service role). Se guardan los últimos 12.
- `errores_app` (agrupados por `firma`, `veces`, `resuelto`): la app reporta con `reportar_error(...)` (SECURITY
  DEFINER, también sin sesión; textos recortados; tope 300 distintos por día). Solo Super Admin los ve y marca resueltos.

---

## Migración 15 — Datos del Registro de publicador (S-21)

Archivo: `MIGRACION_15_REGISTRO_S21.sql` (re-ejecutable; requiere la 12).

- `publicador_registro` (una fila por usuario): `sexo`, `fecha_nacimiento`, `fecha_bautismo`, `esperanza`
  (Otras ovejas/Ungido), `nombramiento` (Anciano/Siervo ministerial), `servicio_especial` (Precursor especial/Misionero
  que sirve en el campo), `actualizado_en/por` (los pone un disparador).
- Datos personales **aparte** de `app_usuarios`: los ven y editan solo Super Admin, Admin Principal y Anciano de la
  misma congregación (el secretario); cada quien ve los suyos y no los puede cambiar.
- Sin la migración el S-21 se genera igual, sin fechas ni datos personales.

---

## Migración 16 — Recordatorios automáticos

Archivos: `MIGRACION_16_RECORDATORIOS.sql` (bitácora `recordatorios_enviados`, RLS sin políticas) y
`MIGRACION_16B_PROGRAMAR_RECORDATORIOS.sql` (pg_cron diario 01:00 UTC = 19:00 México; mismo secreto que el respaldo).
Edge Function `supabase/functions/recordatorios`. Pasos y reglas: `docs/RECORDATORIOS.md`.

---

## Migración 17 — Aseo del Salón del Reino por grupos

Archivos: `MIGRACION_17_ASEO.sql` (re-ejecutable; requiere la 5 y la 12) y `MIGRACION_17B_AVISO_ASEO_MANANA.sql`
(pg_cron 14:00 UTC = 8:00 a. m. México, `{ "accion": "enviar", "momento": "manana" }`; mismo secreto que el respaldo).

- `aseo_planes` (una por congregación, PK `congregacion_id`): `reuniones` JSONB `[{ dia: 0-6, hora: 'HH:MM' }]`
  (0 = domingo), `orden_grupos` BIGINT[], `inicio` (se guarda el lunes de esa semana), `avisos`, `actualizado_en/por`.
- `aseo_cambios` (una por congregación y semana): `semana` (lunes), `grupo_id` o `sin_aseo`, `reuniones` (si esa
  semana cambian los días), `nota`.
- Disparador `aseo_validar`: ningún grupo de otra congregación (ni en el orden ni en un cambio); los grupos borrados
  salen del orden solos; fechas al lunes. RLS `jw_*`: ve la congregación; cambian Super Admin, Admin Principal,
  Anciano y Ministerial de esa congregación.
- Rotación: un grupo por semana, recurrente (`utils/aseo.js`, copiada en la función `recordatorios`).
