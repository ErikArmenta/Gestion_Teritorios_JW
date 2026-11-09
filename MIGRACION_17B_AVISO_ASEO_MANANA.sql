-- ════════════════════════════════════════════════════════════════════════
-- Migración 17B — Aviso del aseo EL MISMO DÍA (8:00 a. m. hora del centro de México)
-- El aviso de "mañana te toca" ya sale con los recordatorios de las 7 p. m. (16B); este agrega el de la mañana.
-- ANTES: la Migración 17 y la función `recordatorios` actualizada (docs/RECORDATORIOS.md).
-- CAMBIA lo marcado con ▶ (el MISMO secreto de la 14B y la 16B) y luego Run. Re-ejecutable.
-- ════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'aseo-manana';

SELECT cron.schedule(
  'aseo-manana',
  '0 14 * * *',  -- 14:00 UTC = 8:00 a. m. en el centro de México (solo manda avisos de aseo de ese día)
  $$
  SELECT net.http_post(
    url := 'https://tbphsksvkglnftxpfjyz.supabase.co/functions/v1/recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secreto', 'PEGA_AQUI_EL_MISMO_RESPALDO_SECRETO'               -- ▶ el secreto
    ),
    body := '{"accion":"enviar","momento":"manana"}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);

SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'aseo-manana';
