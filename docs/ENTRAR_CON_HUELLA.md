# Entrar con huella / Face ID (WebAuthn) — configuración

Hasta que hagas los pasos 1 y 2 la app sigue igual: el botón de huella no aparece.

## 1. Migración 10

Supabase → **SQL Editor** → pega todo `MIGRACION_10_WEBAUTHN.sql` → **Run**.
Crea `webauthn_credenciales` y `webauthn_retos`, ya **blindadas** (RLS sin políticas: la app no
puede leerlas; solo la Edge Function). Se puede volver a ejecutar sin problema.

## 2. Edge Function `webauthn`

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nombre: `webauthn` (exacto).
3. Borra el ejemplo y pega todo `supabase/functions/webauthn/index.ts`.
4. Desactiva **"Verify JWT" / "Enforce JWT verification"** (la usan personas que todavía no
   iniciaron sesión; la función se protege sola: contraseña para activar, firma para entrar,
   y solo acepta peticiones de los dominios permitidos).
5. **Deploy**.

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los pone Supabase solo.

**Dominios permitidos:** por defecto `https://gestion-teritorios-jw.vercel.app` y localhost
(5173/4173). Si usas otro dominio, agrega el secreto `WEBAUTHN_ORIGENES` (Edge Functions → Secrets)
con los dominios separados por coma, p. ej. `https://midominio.com,https://gestion-teritorios-jw.vercel.app`.
Las huellas quedan ligadas al dominio: al cambiar de dominio cada quien la vuelve a activar.

## 3. Uso

- Entra con usuario y contraseña → **Mi Perfil** → "Entrar con huella o Face ID" → elige Huella o
  Face ID (cambia el ícono del botón; el teléfono usa el método que tenga configurado) → escribe tu
  contraseña → **Activar**.
- En la pantalla de entrada aparece el botón cuadrado junto a "Iniciar Sesión". Se toca y listo.
- La contraseña sigue funcionando siempre (si cambias de teléfono o falla la huella).
- Una cuenta desactivada no puede entrar con huella. Al borrar un usuario se borran sus huellas.

## Problemas

| Síntoma | Revisa |
|---|---|
| No aparece el botón | Migración 10 corrida; función `webauthn` desplegada con ese nombre; el aparato tiene huella/Face ID configurado; con internet. El estado se recuerda por pestaña: ciérrala y ábrela |
| "no está permitida en esta dirección" | El dominio no está en `WEBAUTHN_ORIGENES` |
| "ya no está registrada" | Se quitó en otro lado: entra con contraseña y actívala otra vez |
| Errores | Edge Functions → `webauthn` → **Logs** |
