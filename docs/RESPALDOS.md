# Respaldos automáticos y avisos de errores (Migración 14)

## Qué hace

- **Respaldos:** cada domingo a las 3:00 a. m. (hora del centro de México) se guarda una copia
  comprimida de todas las tablas de Gestión Territorial en el bucket **privado** `respaldos`. Se
  conservan los últimos 12, unos 3 meses.
  - Solo la función del servidor puede tocar ese bucket. Ni la app ni los usuarios de tus otras apps
    lo pueden ver, aunque haya políticas abiertas.
  - En **Backup** (solo Super Admin) ves la lista, los descargas, y puedes usar "Respaldar ahora".
- **Errores:** si a alguien le truena algo en su teléfono, se guarda en `errores_app`. El mismo error
  se agrupa y suma "veces". Lo ves en **Backup → Errores de la app**, con qué pantalla, quién, el
  navegador y la versión, y lo puedes marcar como resuelto.
  - Si una pantalla truena, ya no queda en blanco: sale un aviso con "Intentar de nuevo" o "Ir al
    inicio".

## Configurar (una sola vez)

1. **SQL Editor** → pega `MIGRACION_14_RESPALDOS_ERRORES.sql` → **Run**. El reporte debe decir
   `respaldos_publico_debe_ser_false = false` y `candado_respaldos = 1`.
2. **Edge Functions → Deploy a new function → Via Editor**:
   - Nombre: `respaldo`.
   - Pega `supabase/functions/respaldo/index.ts`.
   - **Desactiva "Verify JWT"**.
   - Dale **Deploy**.
3. **Edge Functions → Secrets** → agrega `RESPALDO_SECRETO`. Pon un texto largo inventado, por
   ejemplo 40 letras y números al azar. Ya debe existir `SESION_JWT_SECRET` (o `SESION_JWK_PRIVADA`).
4. Abre `MIGRACION_14B_PROGRAMAR_RESPALDO.sql`, cambia las dos líneas marcadas con ▶ y dale **Run**:
   - Tu Project URL (Settings → API).
   - El mismo `RESPALDO_SECRETO`.
5. En la app, ve a **Backup → Respaldar ahora** para probar. Debe aparecer el primero en la lista.

## Restaurar un respaldo

El archivo `respaldo_AAAA-MM-DD_HHMM.json.gz` trae `{ metadata, datos: { tabla: [filas] } }` de todas las
congregaciones, con las contraseñas cifradas. Restaurar todo es delicado, porque reemplaza datos de
todos. Pídelo con el archivo y se arma el SQL para lo que haga falta: una tabla, una congregación o
todo.

## Revisar que el respaldo semanal corre

En el SQL Editor:
```sql
SELECT status, return_message, start_time FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'respaldo-semanal')
ORDER BY start_time DESC LIMIT 5;
```
Para ver si la función respondió bien: Edge Functions → `respaldo` → **Logs**.
