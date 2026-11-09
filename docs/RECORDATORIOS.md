# Recordatorios automáticos (Migración 16)

Todos los días a las **7:00 p. m.** (hora del centro de México) la función `recordatorios` revisa qué toca
avisar y lo manda por notificación push (OneSignal):

| Qué | Cuándo | A quién | Al tocarla abre |
|---|---|---|---|
| "Recuerda enviar tu informe de *mes*" | El último día del mes y los días 1 y 2 | A quien no lo ha **enviado** (activos) | Informes |
| "Mañana tienes turno" | Un día antes del turno | A quien le toca (si no está rechazado ni cancelado) | Exhibidores |
| "*n* territorios sin trabajar" | Los lunes | Ancianos y Admin Principal de esa congregación | Grupos |

- Nunca se repite un aviso: cada uno se anota en `recordatorios_enviados`. Si pg_cron reintenta, no se manda
  dos veces.
- "Sin trabajar" = más de 4 meses desde que se terminó, o nunca trabajado, y que no esté en progreso. Es el
  mismo criterio del Registro de asignación de territorios.
- Los textos van en español e inglés: OneSignal elige según el idioma del teléfono.

## Configurar (una sola vez)

Requisito: ya debe estar configurado OneSignal en la función `enviar-push` (`docs/NOTIFICACIONES_PUSH.md`).
`recordatorios` usa los mismos secretos: `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY` y `APP_URL`.

1. **SQL Editor** → `MIGRACION_16_RECORDATORIOS.sql` → **Run**.
2. **Edge Functions → Deploy a new function → Via Editor**:
   - Nombre: `recordatorios`.
   - Pega `supabase/functions/recordatorios/index.ts`.
   - **Desactiva "Verify JWT"**.
   - Dale **Deploy**.
3. Abre `MIGRACION_16B_PROGRAMAR_RECORDATORIOS.sql`, pon en la línea ▶ el **mismo secreto del respaldo**
   (`RESPALDO_SECRETO`) y dale **Run**. Debe salir `recordatorios-diarios` con `active = true`.
4. En la app, ve a **Backup → Recordatorios automáticos → "Ver quién los recibiría hoy"**. No manda nada; solo
   muestra a quién le llegaría.

## Revisar que corre

```sql
SELECT status, return_message, start_time FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'recordatorios-diarios')
ORDER BY start_time DESC LIMIT 5;
```
Para ver qué mandó cada día: Edge Functions → `recordatorios` → **Logs**. Ahí queda un resumen por día.
