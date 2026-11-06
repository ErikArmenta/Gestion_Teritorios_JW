-- ════════════════════════════════════════════════════════════════════════
-- Migración 10 — Entrar con huella / Face ID (WebAuthn, passkeys)
-- Re-ejecutable: se puede pegar varias veces en Supabase → SQL Editor → Run.
-- Además hay que desplegar la Edge Function `webauthn` (supabase/functions/webauthn/index.ts).
-- ════════════════════════════════════════════════════════════════════════

-- 10a. Llaves registradas (solo la parte PÚBLICA; la huella nunca sale del teléfono)
CREATE TABLE IF NOT EXISTS webauthn_credenciales (
  id             BIGSERIAL PRIMARY KEY,
  usuario_id     BIGINT NOT NULL REFERENCES app_usuarios(id) ON DELETE CASCADE,
  credencial_id  TEXT NOT NULL UNIQUE,          -- base64url
  llave_publica  TEXT NOT NULL,                 -- base64url (COSE)
  contador       BIGINT NOT NULL DEFAULT 0,
  transportes    TEXT[],
  dispositivo    TEXT,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  usado_en       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_webauthn_cred_usuario ON webauthn_credenciales(usuario_id);

-- 10b. Retos de un solo uso (vencen a los 5 minutos)
CREATE TABLE IF NOT EXISTS webauthn_retos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reto        TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('registro', 'login')),
  usuario_id  BIGINT REFERENCES app_usuarios(id) ON DELETE CASCADE,
  expira_en   TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '5 minutes'
);
CREATE INDEX IF NOT EXISTS idx_webauthn_retos_expira ON webauthn_retos(expira_en);

-- 10c. Blindadas: RLS activado y SIN políticas → la app (anon key) no puede leerlas ni escribirlas.
--      Solo la Edge Function (service role) las usa.
ALTER TABLE webauthn_credenciales ENABLE ROW LEVEL SECURITY;
ALTER TABLE webauthn_retos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON webauthn_credenciales, webauthn_retos FROM anon, authenticated;
REVOKE ALL ON SEQUENCE webauthn_credenciales_id_seq FROM anon, authenticated;

NOTIFY pgrst, 'reload schema';
