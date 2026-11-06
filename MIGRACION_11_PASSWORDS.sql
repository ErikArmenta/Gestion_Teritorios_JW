-- ════════════════════════════════════════════════════════════════════════
-- Migración 11 — Contraseñas cifradas (bcrypt) · blindaje paso 2, FASE 1
-- Re-ejecutable. Pégalo en Supabase → SQL Editor → Run.
--
-- FASE 1 (este archivo): cada contraseña obtiene su versión cifrada (password_hash) y el login
-- (Edge Functions `sesion` y `webauthn`) ya revisa contra ella. La columna `password` original
-- NO se borra todavía: todo sigue funcionando igual, también versiones viejas de la app.
-- FASE 2 (MIGRACION_11B_SIN_TEXTO_PLANO.sql): borra las contraseñas en texto plano. Córrela cuando
-- confirmes que todos entran bien.
-- ════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 11a. Columna cifrada; la original puede quedar vacía (en la fase 2)
ALTER TABLE app_usuarios ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE app_usuarios ALTER COLUMN password DROP NOT NULL;

-- 11b. Ajustes de seguridad (solo los usa la base de datos; la app no puede leerlos)
CREATE TABLE IF NOT EXISTS seguridad_config (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
ALTER TABLE seguridad_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguridad_config FROM anon, authenticated;

-- 11c. Cada vez que se escribe una contraseña (alta, cambio, respaldo) se cifra sola.
--      En la fase 2 además se borra el texto plano.
CREATE OR REPLACE FUNCTION app_usuarios_cifrar_password() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NEW.password IS NOT NULL AND NEW.password <> ''
     AND (TG_OP = 'INSERT' OR NEW.password IS DISTINCT FROM OLD.password OR NEW.password_hash IS NULL) THEN
    NEW.password_hash := extensions.crypt(NEW.password, extensions.gen_salt('bf', 10));
  END IF;
  IF EXISTS (SELECT 1 FROM seguridad_config WHERE clave = 'borrar_password_plano' AND valor = 'si') THEN
    NEW.password := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_app_usuarios_cifrar_password ON app_usuarios;
CREATE TRIGGER trg_app_usuarios_cifrar_password
  BEFORE INSERT OR UPDATE ON app_usuarios
  FOR EACH ROW EXECUTE FUNCTION app_usuarios_cifrar_password();

-- 11d. Revisar una contraseña (por usuario o por id). Devuelve el id o NULL.
--      Mientras alguien no tenga versión cifrada, se compara con la de siempre.
--      Solo la pueden llamar las Edge Functions (service role), nunca la app.
CREATE OR REPLACE FUNCTION verificar_password(p_password TEXT, p_usuario TEXT DEFAULT NULL, p_id BIGINT DEFAULT NULL)
RETURNS BIGINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT id FROM app_usuarios
  WHERE (p_id IS NOT NULL AND id = p_id OR p_id IS NULL AND p_usuario IS NOT NULL AND usuario = p_usuario)
    AND COALESCE(p_password, '') <> ''
    AND (
      (password_hash IS NOT NULL AND password_hash = extensions.crypt(p_password, password_hash))
      OR (password_hash IS NULL AND password = p_password)
    )
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION verificar_password(TEXT, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION verificar_password(TEXT, TEXT, BIGINT) TO service_role;

-- 11e. Cifrar las contraseñas que ya existen (no toca la original)
UPDATE app_usuarios
SET password_hash = extensions.crypt(password, extensions.gen_salt('bf', 10))
WHERE password_hash IS NULL AND password IS NOT NULL AND password <> '';

NOTIFY pgrst, 'reload schema';
