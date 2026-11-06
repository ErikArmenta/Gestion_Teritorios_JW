-- ════════════════════════════════════════════════════════════════════════
-- Migración 11B — Borrar las contraseñas en texto plano · blindaje paso 2, FASE 2
-- Requiere MIGRACION_11_PASSWORDS.sql. Re-ejecutable.
--
-- ANTES de correrla:
--   1. La app nueva está publicada (Vercel) y las Edge Functions `sesion` y `webauthn` tienen el
--      código nuevo (revisan la contraseña cifrada).
--   2. Probaste salir y entrar con contraseña, y cambiar una contraseña en Mi Perfil.
-- Después de esto NADIE (ni los admins) puede ver contraseñas: solo se pueden cambiar.
-- ════════════════════════════════════════════════════════════════════════

-- De aquí en adelante, toda contraseña nueva se guarda solo cifrada
INSERT INTO seguridad_config (clave, valor) VALUES ('borrar_password_plano', 'si')
ON CONFLICT (clave) DO UPDATE SET valor = 'si';

-- Cifra a quien todavía no tenga versión cifrada y borra el texto plano (el disparador hace las dos cosas)
UPDATE app_usuarios SET password = password WHERE password IS NOT NULL;

-- Comprobación: debe dar 0 y 0
SELECT
  count(*) FILTER (WHERE password IS NOT NULL)                    AS con_texto_plano,
  count(*) FILTER (WHERE password_hash IS NULL)                   AS sin_cifrar
FROM app_usuarios;
