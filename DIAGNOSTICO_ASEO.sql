-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico de los avisos del aseo (SOLO LEE, no cambia nada). Supabase → SQL Editor → Run.
-- Sale UNA fila con todo: cópiala completa y pásala.
-- ════════════════════════════════════════════════════════════════════════
SELECT jsonb_pretty(jsonb_build_object(
  'hora_mexico', to_char(now() AT TIME ZONE 'America/Mexico_City', 'YYYY-MM-DD HH24:MI (Dy)'),

  -- ¿Están programados los dos avisos (7 p. m. y 8 a. m.)?
  'cron', (SELECT jsonb_agg(jsonb_build_object('nombre', jobname, 'horario', schedule, 'activo', active))
           FROM cron.job WHERE jobname IN ('recordatorios-diarios', 'aseo-manana')),
  'ultimas_corridas', (SELECT jsonb_agg(x) FROM (
      SELECT j.jobname AS nombre, d.status, left(d.return_message, 120) AS mensaje,
             to_char(d.start_time AT TIME ZONE 'America/Mexico_City', 'MM-DD HH24:MI') AS hora_mexico
      FROM cron.job_run_details d JOIN cron.job j ON j.jobid = d.jobid
      WHERE j.jobname IN ('recordatorios-diarios', 'aseo-manana')
      ORDER BY d.start_time DESC LIMIT 6) x),

  -- Lo que contestó la función las últimas veces (pg_net las guarda unas horas). Si no trae "aseo",
  -- la función desplegada es la vieja.
  'respuestas_funcion', (SELECT jsonb_agg(x) FROM (
      SELECT to_char(created AT TIME ZONE 'America/Mexico_City', 'MM-DD HH24:MI') AS hora_mexico, status_code,
             left(content::text, 500) AS contenido
      FROM net._http_response
      WHERE content::text LIKE '%"informe"%' OR content::text LIKE '%falta_migracion%' OR content::text LIKE '%sin_permiso%'
      ORDER BY created DESC LIMIT 6) x),

  -- La planeación y cuántos hermanos activos hay en cada grupo de la rotación (a ellos les llega)
  'planes', (SELECT jsonb_agg(jsonb_build_object(
      'congregacion', c.nombre, 'reuniones', p.reuniones, 'inicio', p.inicio, 'avisos', p.avisos,
      'grupos', (SELECT jsonb_agg(jsonb_build_object('grupo', g.nombre,
                   'hermanos_activos', (SELECT count(*) FROM app_usuarios u WHERE u.grupo_id = g.id AND u.activo IS NOT FALSE))
                   ORDER BY array_position(p.orden_grupos, g.id))
                 FROM grupos_predicacion g WHERE g.id = ANY (p.orden_grupos))))
    FROM aseo_planes p JOIN congregaciones c ON c.id = p.congregacion_id),
  'cambios_de_semana', (SELECT count(*) FROM aseo_cambios),

  -- ¿Se intentó mandar? ¿Se guardó la notificación?
  'avisos_aseo_anotados', (SELECT count(*) FROM recordatorios_enviados WHERE clave LIKE 'aseo:%'),
  'notificaciones_aseo', (SELECT count(*) FROM notificaciones WHERE titulo LIKE '%aseo del Salón%'),
  'notificaciones_tiene_metadata', EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'notificaciones' AND column_name = 'metadata'),
  'notificaciones_reglas', (SELECT jsonb_agg(pg_get_constraintdef(oid)) FROM pg_constraint
      WHERE conrelid = 'public.notificaciones'::regclass AND contype = 'c')
)) AS diagnostico;
