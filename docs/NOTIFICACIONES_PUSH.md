# Notificaciones push con OneSignal — Guía de configuración

Esta guía explica, paso a paso, lo que hay que configurar **fuera del código** para que la app
Gestión Territorial JW mande notificaciones push a los teléfonos de los hermanos.

El código ya está listo en el repositorio:

| Pieza | Archivo | Qué hace |
|---|---|---|
| SDK en la app | `src/utils/onesignal.js` | Suscribe el teléfono y lo etiqueta con usuario, congregación, rol y grupo |
| Service worker | `public/sw.js` | Recibe los push (carga el SDK de OneSignal) y sigue manejando el modo sin conexión |
| Envío automático | `supabase/functions/enviar-push/index.ts` | Manda el push cuando pasa algo en la base de datos |

## Qué notificaciones se envían

| Cuándo | A quién | Al tocarla abre |
|---|---|---|
| Alguien activa el botón de pánico | Toda su congregación (menos quien la activó) | Alertas |
| Se asigna un territorio a un grupo | Los publicadores de ese grupo | Mapa |
| Un grupo termina su territorio | Los publicadores de ese grupo | Mapa |
| Se crea una notificación interna (asignación, turno de exhibidor…) | El destinatario | Mapa o Exhibidores |

> **Importante:** las notificaciones push **solo funcionan en la app publicada en Vercel** (con HTTPS),
> no en `localhost`. En iPhone solo funcionan si la app está **instalada en la pantalla de inicio**
> (Compartir → Agregar a inicio) y con iOS 16.4 o más nuevo. En Android funcionan siempre.

---

## Paso 1 — Crear la app en OneSignal

1. Entra a [onesignal.com](https://onesignal.com) → **New App/Website**.
2. Nombre: `Gestión Territorial JW`. Organización: la que prefieras.
3. Plataforma: **Web** → **Typical Site**.
4. Llena:
   - **Site Name:** `Gestión Territorial JW`
   - **Site URL:** el dominio de Vercel, por ejemplo `https://gestion-teritorios-jw.vercel.app`
     (sin `/` al final).
   - **Auto Resubscribe:** activado.
   - **Default Icon URL:** `https://gestion-teritorios-jw.vercel.app/icons/icon-192.png`
5. Busca la sección **Service Workers** (a veces dentro de *Advanced*) y activa
   **"Customize service worker paths and filenames"**:
   - Path to service worker files: `/`
   - Main service worker filename: `sw.js`
   - Updater service worker filename: `sw.js`
   - Service worker registration scope: `/`

   Esto es necesario porque la app usa **un solo** service worker propio que ya incluye OneSignal.
6. Guarda. Si te muestra un código para pegar en la página, **sáltalo**: ya está integrado.

## Paso 2 — Poner el App ID en Vercel

1. En OneSignal: **Settings → Keys & IDs** → copia el **OneSignal App ID**.
2. En Vercel: tu proyecto → **Settings → Environment Variables** → agrega:
   - Nombre: `VITE_ONESIGNAL_APP_ID`
   - Valor: el App ID
   - Entornos: Production (y Preview si quieres)
3. **Redeploy** del proyecto (Deployments → los tres puntos del último → Redeploy).
   Las variables `VITE_*` se incrustan al compilar, por eso hay que volver a desplegar.

## Paso 3 — Probar una notificación manual

1. Abre la app en Vercel (en el teléfono o en Chrome), inicia sesión.
2. Toca **Activar** en el aviso "Activar Notificaciones" y acepta el permiso del navegador.
   - Si no aparece el aviso: el permiso ya se había decidido antes. En el candado de la barra de
     direcciones → Notificaciones → Permitir, y recarga.
3. En OneSignal: **Audience → Subscriptions**. Debe aparecer tu dispositivo con
   **External ID = tu id de usuario** y las etiquetas `congregacion_id`, `rol`, `grupo_id`.
4. **Messages → New Push**:
   - Audience: tu suscripción (o "Test Users").
   - Título y mensaje de prueba.
   - **Launch URL:** `https://gestion-teritorios-jw.vercel.app/alerts` ← este es el link de navegación.
   - Send.
5. Te debe llegar la notificación y, al tocarla, abrir la pantalla de Alertas.

✅ Si esto funciona, la parte de la app está lista. Sigue con los envíos automáticos.

## Paso 4 — Envíos automáticos (Supabase)

### 4a. REST API Key de OneSignal

1. OneSignal → **Settings → Keys & IDs** → **Add Key** (o "REST API Key") → cópiala.
2. **Esta llave es secreta:** solo va en Supabase. Nunca en el código, en `.env` del frontend ni en git.

### 4b. Crear la función `enviar-push`

1. Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nombre: `enviar-push`.
3. Borra el código de ejemplo y pega **todo** el contenido de
   `supabase/functions/enviar-push/index.ts`.
4. Desactiva **"Verify JWT" / "Enforce JWT verification"** (la función se protege con su propia
   clave secreta, ver 4c).
5. **Deploy**.

### 4c. Secretos de la función

Supabase → **Edge Functions → Secrets** (o *Manage secrets*) → agrega:

| Nombre | Valor |
|---|---|
| `ONESIGNAL_APP_ID` | El App ID del paso 2 |
| `ONESIGNAL_REST_API_KEY` | La llave del paso 4a |
| `APP_URL` | `https://gestion-teritorios-jw.vercel.app` (sin `/` al final) |
| `WEBHOOK_SECRET` | Una clave larga inventada, p. ej. 40 letras y números al azar |

Guarda el `WEBHOOK_SECRET`: lo vas a usar en los webhooks.

### 4d. Webhooks de la base de datos

Supabase → **Database → Webhooks** → (si lo pide, *Enable webhooks*) → **Create a new hook**.
Crea estos 3, todos con:

- **Type:** Supabase Edge Functions → función `enviar-push`, método **POST**
- **HTTP Headers:** agrega `x-webhook-secret` = tu `WEBHOOK_SECRET`

| Nombre del webhook | Tabla | Eventos |
|---|---|---|
| `push-alertas` | `alertas_panico` | Insert |
| `push-trabajos` | `territorio_trabajos` | Insert, Update |
| `push-notificaciones` | `notificaciones` | Insert |

### 4e. Probar

1. Con **dos** usuarios de la misma congregación, cada uno con notificaciones activadas:
   activa el botón de pánico con uno → al otro le debe llegar "🚨 ALERTA DE EMERGENCIA".
2. Asigna un territorio a un grupo (mapa → tocar territorio → Asignar a grupo) → a los
   publicadores de ese grupo les llega "📍 Territorio asignado a tu grupo".
3. Si no llega, revisa **Edge Functions → enviar-push → Logs**: cada evento registra la tabla
   y la respuesta de OneSignal.

---

## Si algo falla

| Síntoma | Qué revisar |
|---|---|
| El dispositivo no aparece en *Subscriptions* | `VITE_ONESIGNAL_APP_ID` en Vercel + Redeploy; permiso de notificaciones permitido; estás en el dominio de Vercel (no localhost) |
| Aparece pero sin External ID | Cierra sesión y vuelve a entrar en la app |
| En iPhone no llega | La app debe estar instalada en la pantalla de inicio y abierta desde ese ícono |
| Logs de la función dicen `401 No autorizado` | El header `x-webhook-secret` del webhook no coincide con el secreto `WEBHOOK_SECRET` |
| Logs dicen `omitido: sin destinatarios` | Nadie cumple el filtro (p. ej. el grupo no tiene publicadores, o eres el único en la congregación) |
| OneSignal responde error de autenticación | Revisa `ONESIGNAL_REST_API_KEY` y `ONESIGNAL_APP_ID` en los secretos |
| Llegan notificaciones dobles | No crear otro service worker ni pegar el snippet de OneSignal en `index.html` |
| El link abre la página equivocada | Revisa `APP_URL` (sin `/` al final) |

## Notas para quien mantenga el código

- Para notificar un evento nuevo: agrega su caso en `construir()` de
  `supabase/functions/enviar-push/index.ts`, vuelve a desplegar la función y crea su webhook.
- Los destinatarios se buscan en `app_usuarios` (activos) por congregación o grupo; el teléfono
  se encuentra en OneSignal por su `external_id` = id del usuario.
- La app solo inicializa OneSignal en producción y si existe `VITE_ONESIGNAL_APP_ID`.
