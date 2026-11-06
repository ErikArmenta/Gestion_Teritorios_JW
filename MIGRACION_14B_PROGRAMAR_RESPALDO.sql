-- ════════════════════════════════════════════════════════════════════════
-- Migración 14B — Programar el respaldo automático (cada domingo, 3:00 a. m. hora del centro de México)
-- ANTES: desplegar la Edge Function `respaldo` y poner el secreto RESPALDO_SECRETO (docs/RESPALDOS.md).
-- CAMBIA las dos cosas marcadas con ▶ y luego Run. Re-ejecutable (reemplaza la programación anterior).
-- ════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'respaldo-semanal';

SELECT cron.schedule(
  'respaldo-semanal',
  '0 9 * * 0',  -- domingo 09:00 UTC = 03:00 en el centro de México
  $$
  SELECT net.http_post(
    url := 'https://TU-PROYECTO.supabase.co/functions/v1/respaldo',          -- ▶ tu Project URL
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-respaldo-secreto', 'PEGA_AQUI_EL_MISMO_RESPALDO_SECRETO'            -- ▶ el secreto
    ),
    body := '{"accion":"crear"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'respaldo-semanal';
