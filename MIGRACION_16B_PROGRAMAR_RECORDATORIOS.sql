-- ════════════════════════════════════════════════════════════════════════
-- Migración 16B — Programar los recordatorios (todos los días, 7:00 p. m. hora del centro de México)
-- ANTES: desplegar la Edge Function `recordatorios` (docs/RECORDATORIOS.md). Usa el MISMO secreto que el respaldo
-- (RESPALDO_SECRETO), así no hay que crear otro.
-- CAMBIA lo marcado con ▶ (el mismo secreto que pusiste en la 14B) y luego Run. Re-ejecutable.
-- ════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'recordatorios-diarios';

SELECT cron.schedule(
  'recordatorios-diarios',
  '0 1 * * *',  -- 01:00 UTC = 19:00 en el centro de México (la función decide qué toca mandar ese día)
  $$
  SELECT net.http_post(
    url := 'https://tbphsksvkglnftxpfjyz.supabase.co/functions/v1/recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secreto', 'PEGA_AQUI_EL_MISMO_RESPALDO_SECRETO'               -- ▶ el secreto
    ),
    body := '{"accion":"enviar"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'recordatorios-diarios';
