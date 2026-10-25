-- Migración 6 — Disparadores de notificaciones push (en lugar de los Database Webhooks del panel)
-- Llaman a la Edge Function `enviar-push` cuando:
--   alertas_panico      INSERT           → toda la congregación
--   territorio_trabajos INSERT / UPDATE  → publicadores del grupo
--   notificaciones      INSERT           → el destinatario
--
-- ANTES DE CORRER: reemplaza PEGA_AQUI_TU_WEBHOOK_SECRET por el mismo valor del secreto
-- WEBHOOK_SECRET de la función (Edge Functions → Secrets). No subas el secreto a git.
-- La función `enviar-push` debe estar desplegada con "Verify JWT" apagado.
-- Se puede correr más de una vez.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.notificar_push() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
BEGIN
  -- Llamada asíncrona: si la función falla, el INSERT/UPDATE de la app no se ve afectado
  PERFORM net.http_post(
    url := 'https://tbphsksvkglnftxpfjyz.supabase.co/functions/v1/enviar-push',
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', 'PEGA_AQUI_TU_WEBHOOK_SECRET'
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_alertas ON alertas_panico;
CREATE TRIGGER push_alertas
  AFTER INSERT ON alertas_panico
  FOR EACH ROW EXECUTE FUNCTION public.notificar_push();

DROP TRIGGER IF EXISTS push_trabajos ON territorio_trabajos;
CREATE TRIGGER push_trabajos
  AFTER INSERT OR UPDATE ON territorio_trabajos
  FOR EACH ROW EXECUTE FUNCTION public.notificar_push();

DROP TRIGGER IF EXISTS push_notificaciones ON notificaciones;
CREATE TRIGGER push_notificaciones
  AFTER INSERT ON notificaciones
  FOR EACH ROW EXECUTE FUNCTION public.notificar_push();
