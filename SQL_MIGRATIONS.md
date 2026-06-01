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
