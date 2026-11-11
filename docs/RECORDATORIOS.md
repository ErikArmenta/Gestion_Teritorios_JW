# Recordatorios automáticos (Migraciones 16 y 17)

Todos los días a las **7:00 p. m.** (hora del centro de México) la función `recordatorios` revisa qué toca
avisar y lo manda por notificación push (OneSignal):

| Qué | Cuándo | A quién | Al tocarla abre |
|---|---|---|---|
| "Recuerda enviar tu informe de *mes*" | El último día del mes y los días 1 y 2 | A quien no lo ha **enviado** (activos) | Informes |
| "Mañana tienes turno" | Un día antes del turno | A quien le toca (si no está rechazado ni cancelado) | Exhibidores |
| "*n* territorios sin trabajar" | Los lunes | Ancianos y Admin Principal de esa congregación | Grupos |
| "🧹 *Grupo*: aseo del Salón mañana / hoy" (con el versículo) | Un día antes de cada reunión (7 p. m.) y el mismo día (8 a. m.) | Los hermanos del grupo al que le toca esa semana | La app (sale una ventana con el mensaje) |

- Nunca se repite un aviso: cada uno se anota en `recordatorios_enviados`. Si pg_cron reintenta, no se manda
  dos veces.
- "Sin trabajar" = más de 4 meses desde que se terminó, o nunca trabajado, y que no esté en progreso. Es el
  mismo criterio del Registro de asignación de territorios.
- Los textos van en español e inglés: OneSignal elige según el idioma del teléfono.

### Aseo del Salón (Migración 17)

La planeación se hace en **Grupos → Aseo del Salón del Reino** (Super Admin, Admin Principal, Ancianos y
Ministeriales; cada congregación la suya): días y hora de las reuniones, orden de los grupos y la semana en que
empieza. Le toca **un grupo por semana** y se repite solo. Para una semana distinta (asamblea, visita del
superintendente) se cambia solo esa semana con el lápiz.

El aviso del aseo **no** va directo a OneSignal: se guarda en `notificaciones` (así sale la ventana bonita en la app)
y el webhook `push-notificaciones` de `enviar-push` manda el push. El de la mañana lo programa
`MIGRACION_17B_AVISO_ASEO_MANANA.sql`.

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
5. **Aseo:** corre `MIGRACION_17_ASEO.sql`; vuelve a desplegar `recordatorios` (pega el código nuevo); abre
   `MIGRACION_17B_AVISO_ASEO_MANANA.sql`, pon el mismo secreto en ▶ y **Run** (debe salir `aseo-manana`, `active = true`).
   Y `MIGRACION_17C_NOTIFICACIONES_METADATA.sql` (la tabla `notificaciones` necesita la columna `metadata`).

## Probar que llegan a tu teléfono

**Backup → Recordatorios automáticos → "Mandarme una prueba"** (Super Admin; le llega SOLO a quien la toca y no se
anota en la bitácora):
1. Push directo por OneSignal (el camino del informe, los turnos y los territorios). Si dice que OneSignal no encontró
   tu teléfono: activa las notificaciones en ese teléfono (menú → Activar notificaciones) y vuelve a probar.
2. Aviso del aseo como el de verdad (notificación guardada → push por el webhook → ventana al abrir la app).

## Si no llegan los avisos del aseo

Corre `DIAGNOSTICO_ASEO.sql` (solo lee): dice si los dos horarios están programados, qué contestó la función
(`aseoError` / `aseoSinMetadata`), cuántos hermanos activos tiene cada grupo (a ellos les llega) y si
`notificaciones` tiene la columna `metadata`.

## Revisar que corre

```sql
SELECT status, return_message, start_time FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'recordatorios-diarios')
ORDER BY start_time DESC LIMIT 5;
```
Para ver qué mandó cada día: Edge Functions → `recordatorios` → **Logs**. Ahí queda un resumen por día.
