-- ════════════════════════════════════════════════════════════════════════
-- Diagnóstico para el blindaje (paso 3). SOLO LEE la estructura de la base de datos:
-- tablas, columnas, permisos, políticas, disparadores y buckets. No lee datos de nadie
-- y no cambia nada. Supabase → SQL Editor → pegar → Run → copiar el resultado (una celda).
-- ════════════════════════════════════════════════════════════════════════
SELECT json_build_object(
  'tablas', (
    SELECT json_agg(json_build_object(
      'tabla', c.relname,
      'rls', c.relrowsecurity,
      'columnas', (
        SELECT json_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                        || CASE WHEN a.attnotnull THEN ' NOT NULL' ELSE '' END ORDER BY a.attnum)
        FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
      ),
      'fk', (
        SELECT json_agg(pg_get_constraintdef(k.oid))
        FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'f'
      ),
      'permisos_anon', (
        SELECT json_agg(DISTINCT g.privilege_type)
        FROM information_schema.role_table_grants g
        WHERE g.table_schema = 'public' AND g.table_name = c.relname AND g.grantee = 'anon'
      )
    ) ORDER BY c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  ),
  'vistas', (
    SELECT json_agg(c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
  ),
  'politicas', (
    SELECT json_agg(json_build_object('esquema', schemaname, 'tabla', tablename, 'nombre', policyname,
      'cmd', cmd, 'roles', roles, 'using', qual, 'check', with_check))
    FROM pg_policies WHERE schemaname IN ('public', 'storage')
  ),
  'disparadores', (
    SELECT json_agg(t.tgname || ' ON ' || t.tgrelid::regclass::text)
    FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname = 'public'
  ),
  'funciones', (
    SELECT json_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
                    || CASE WHEN p.prosecdef THEN ' SECURITY DEFINER' ELSE '' END)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
  ),
  'realtime', (SELECT json_agg(tablename) FROM pg_publication_tables WHERE pubname = 'supabase_realtime'),
  'buckets', (SELECT json_agg(json_build_object('id', id, 'publico', public)) FROM storage.buckets),
  'webhooks', (
    SELECT json_agg(t.tgname || ' ON ' || t.tgrelid::regclass::text)
    FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE NOT t.tgisinternal AND p.proname ILIKE '%http%'
  ),
  'extensiones', (SELECT json_agg(extname || ' ' || extversion) FROM pg_extension),
  'version', version()
) AS diagnostico;
