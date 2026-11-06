# Sesión firmada por el servidor (blindaje, paso 1)

**Qué cambia:** al entrar (con contraseña o con huella), una Edge Function revisa los datos en el servidor
y le da a la app un **token firmado** que dice quién eres (`usuario_id`, `congregacion_id`, rol, grupo).
La app lo manda en cada consulta a Supabase.

**Qué NO cambia todavía:** las tablas siguen abiertas como hoy. El token usa el mismo rol de Postgres que
la llave pública (`anon`), así que ningún permiso cambia. En el paso 3, los permisos de cada tabla van a
leer ese token (`auth.jwt() ->> 'congregacion_id'`), y la llave pública sola ya no va a ver nada.

**Seguro contra fallos:**

- Si la función no está desplegada, la app entra con el login de siempre.
- Si la función no tiene llave de firma, entra pero sin token.
- Antes de entregar un token, la función lo prueba contra la base de datos. Si Supabase no lo acepta,
  no lo entrega.
- Si algún día Supabase empieza a rechazar el token (por ejemplo, porque cambiaste la llave), la app lo
  olvida y repite la consulta con la llave pública.

## 1. Desplegar la función `sesion`

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. En el nombre pon `sesion`, exacto.
3. Pega todo el archivo `supabase/functions/sesion/index.ts`.
4. **Desactiva "Verify JWT"**.
5. Dale **Deploy**.

## 2. Volver a desplegar `webauthn`

Edge Functions → `webauthn` → **Code** → reemplaza todo el código con el nuevo
`supabase/functions/webauthn/index.ts` → **Deploy**. Así, entrar con huella también entrega el token.
"Verify JWT" sigue desactivado.

## 3. La llave para firmar: elige UNA

Supabase → **Project Settings** → **JWT Keys**.

### Opción A (la más fácil): el secreto legacy

1. En la pestaña **Legacy JWT Secret**, dale **Reveal** y cópialo.
2. Ve a **Edge Functions** → **Secrets** → **Add new secret**:
   - Name: `SESION_JWT_SECRET`
   - Value: el secreto que copiaste
3. Dale **Save**.

Esto sirve si el secreto legacy está como *Legacy*, *In use* o *Previously used*. **No** sirve si está
*Revoked*; en ese caso usa la opción B.

### Opción B: una llave propia (ES256)

1. En una terminal: `npx supabase gen signing-key --algorithm ES256`. Imprime un JSON con `"kid"` y `"d"`.
   **Guárdalo bien:** es secreto y Supabase no lo deja volver a ver.
2. En **JWT Keys** → **Create standby key** → **Import an existing private key** → pega el JSON → guarda.
3. Dale **Rotate keys** para que esa llave quede como actual. La app no usa Supabase Auth, así que
   rotar no afecta nada más.
4. Espera unos **20 minutos**: Supabase tarda en reconocer la llave.
5. Ve a **Edge Functions** → **Secrets** → agrega `SESION_JWK_PRIVADA` con el JSON completo en una sola línea.

## 4. Comprobar

1. Sal de la app y vuelve a entrar.
2. En **Mi Perfil**, debajo del título, tiene que salir **"Sesión protegida por el servidor"**.

Si no sale:

- Ve a Edge Functions → `sesion` → **Logs**.
- Si dice `Supabase rechazó el token de sesión`, Supabase no acepta la llave: revisa el paso 3
  (en la opción B, espera los 20 minutos).
- Si dice `Llave de sesión inválida`, el secreto quedó mal copiado.

Las sesiones que ya estaban abiertas antes de esto siguen funcionando sin token hasta que la persona
vuelva a entrar. En el paso 3 se les pedirá entrar otra vez.

## Notas

- El token dura 30 días. La app lo renueva sola una vez al día, cuando se abre con internet. Al renovarlo
  también se actualizan el rol y la congregación.
- Si un admin desactiva o borra una cuenta, esa persona queda fuera la próxima vez que su app renueve
  el token.
- La app no usa `supabase.auth`: el cliente está configurado con `accessToken` (`src/supabaseClient.js`).

---

# Paso 2: contraseñas cifradas

Hoy las contraseñas se guardan tal cual en `app_usuarios.password`. Con este paso se guardan **cifradas
con bcrypt**: aunque alguien lea la tabla, no puede ver ninguna contraseña. Va en dos fases para que
nunca falle el login.

## Fase 1 (segura, se puede hacer ya)

1. Espera a que Vercel publique la app nueva.
2. Edge Functions → `sesion` → **Code** → pega el `supabase/functions/sesion/index.ts` nuevo → **Deploy**.
3. Haz lo mismo con `webauthn` (`supabase/functions/webauthn/index.ts`).
4. SQL Editor → pega `MIGRACION_11_PASSWORDS.sql` → **Run**.

Cada contraseña queda con su versión cifrada y el login revisa esa. La original **todavía no se borra**,
así que todo sigue igual (y si algo falla, la original sigue ahí).

**Prueba:**

- Sal y entra con tu contraseña.
- Entra con huella.
- Cambia una contraseña en Mi Perfil y vuelve a entrar con la nueva.
- Crea un usuario de prueba y entra con él.

## Fase 2 (cuando la fase 1 jale bien)

SQL Editor → pega `MIGRACION_11B_SIN_TEXTO_PLANO.sql` → **Run**. La última consulta debe mostrar
`con_texto_plano = 0`.

Desde ahí:

- Las contraseñas solo existen cifradas. En **Usuarios** salen como "Cifrada" y ya nadie las puede ver,
  ni los admins.
- Para darle una contraseña nueva a alguien: **Editar** → "Nueva contraseña". Si la dejas vacía, no cambia.
- Los respaldos ya no llevan contraseñas legibles.
- Ojo: el login de respaldo (directo a la tabla, el que se usa si la función `sesion` no responde) deja
  de servir. Por eso la función tiene que estar desplegada.

