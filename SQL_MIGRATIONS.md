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
