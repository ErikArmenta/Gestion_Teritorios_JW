# Reglas del proyecto — Gestión Territorial JW

App web (PWA) para gestionar territorios de predicación: mapa de territorios y manzanas,
registro de casas y visitas, exhibidores con turnos, alertas de pánico y notificaciones.
Multi-congregación. Desarrollada por Master Engenering EA. Idioma de la UI: **español**.

## Stack

- React 19 + Vite 8 (JSX, sin TypeScript), React Router 7
- Tailwind CSS v4 (`@tailwindcss/postcss`) + CSS propio en `src/index.css`
- Supabase (`src/supabaseClient.js`) — solo base de datos/storage/realtime, **no** Supabase Auth
- Leaflet / react-leaflet 5 / leaflet-draw / react-leaflet-cluster / Turf
- Chart.js, jsPDF + autotable, xlsx, lucide-react (iconos)
- Deploy en Vercel (`vercel.json`: rewrite SPA + headers de `sw.js` y `manifest.json`)

## Comandos

```bash
npm install
npm run dev       # desarrollo (el Service Worker NO se registra en dev)
npm run build     # verificar SIEMPRE antes de commitear
npm run preview   # probar el build de producción + PWA
npm run lint
```

Variables en `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Nunca commitear `.env`.

## Estructura

- `src/pages/` — una pantalla por ruta (rutas en `src/App.jsx`)
- `src/components/` — modales, navegación (`Sidebar` desktop, `BottomNav` móvil), pánico, notificaciones, `PWAPrompts`
- `src/context/` — `AuthContext` (sesión), `DataContext` (territorios/casas + offline + realtime), `NotificationContext`, `ThemeContext`
- `src/utils/` — `constants.js` (estados, colores, roles), `offlineStore.js` (IndexedDB), `pwa.js` (SW, instalación, notificaciones)
- `public/` — `sw.js`, `manifest.json`, `favicon.svg`, `icons/` (logo de mapa), `JW.jpg` (logo de la barra lateral/login)

## Roles y permisos

`Super Admin` > `Admin Principal` > `Anciano` / `Ministerial` > `Publicador`.

- El acceso por ruta se define con `ProtectedRoute allowedRoles={[...]}` en `App.jsx`.
- Los menús (`Sidebar.jsx` y `BottomNav.jsx`) tienen **cada uno** su lista `menuItems` con `roles`.
  Al agregar/cambiar una pantalla, actualizar `App.jsx`, `Sidebar.jsx` **y** `BottomNav.jsx`.
- Datos filtrados por `user.congregacion_id` (Super Admin puede ver todas). Toda consulta nueva
  a tablas por congregación debe respetar ese filtro.
- Exhibidores y sus turnos son **por congregación**: se leen con `queryExhibidores()` /
  `queryExhibidorTurnos()` en `DataContext` (filtran por `congregacion_id`) y los inserts lo asignan.
- **Grupos de predicación** (Migración 5): `GruposContext` (`grupos_predicacion`,
  `territorio_trabajos`, `app_usuarios.grupo_id`). Los territorios se asignan a grupos; el encargado
  o un anciano/ministerial/admin los marca "Terminado". Si la migración no existe, `disponible`
  es `false` y la app sigue funcionando (progreso solo por casas). Pantalla: `/grupos`.
  Los grupos **no se mezclan entre congregaciones**: la BD lo impide con triggers (Migración 5e en
  `MIGRACION_5_GRUPOS.sql`) y la app solo ofrece grupos de la congregación del territorio/usuario.
- Migraciones nuevas: además de documentarlas en `SQL_MIGRATIONS.md`, dejar un `.sql` puro y
  re-ejecutable (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`) para pegar en Supabase.

## Datos (Supabase)

Tablas principales: `app_usuarios`, `congregaciones`, `territorios`, `territorio_manzanas`,
`territorio_asignaciones`, `territorio_compartidos`, `casas`, `historial_visitas`, `fotos_casas`,
`notas_voz`, `exhibidores`, `exhibidor_turnos`, `alertas_panico`, `notificaciones`.

- Cambios de esquema: documentarlos en `SQL_MIGRATIONS.md` (y storage en `STORAGE_SETUP.sql`).
- Antes de usar una columna, confirmar que existe (ya hubo bugs por columnas inexistentes, p. ej. `telefono`).
- Si un `select` con relación da error de "relación ambigua", especificar la FK: `app_usuarios!fk_nombre(...)`.
- Estados de casa: usar `STATUS_COLORS` / `STATUS_OPTIONS` de `constants.js`, nunca strings sueltos.
- Riesgo conocido: el login compara usuario/contraseña directo contra `app_usuarios` con la anon key.
  No exponer más datos sensibles por esa vía; cualquier mejora de seguridad debe coordinarse con el dueño.

## Offline y PWA

- `DataContext` guarda territorios/casas en IndexedDB y encola escrituras sin conexión (`pendingQueue`);
  las operaciones nuevas de escritura sobre casas deben pasar por esa cola.
- Sin conexión: `offlineStore` (IndexedDB) guarda territorios y casas, una cola de escrituras pendientes,
  y un almacén genérico `guardarDatos/leerDatos` (clave = `nombre:congregacion`) para manzanas,
  usuarios, asignaciones, exhibidores y grupos. Todo conjunto nuevo que deba verse sin internet se
  guarda ahí al cargarlo y se restaura en el camino offline. Al volver la conexión se recarga.
- **Push (OneSignal)**: `src/utils/onesignal.js`. Activo solo con `VITE_ONESIGNAL_APP_ID` y en
  producción. Tiene su propio worker en `public/push/onesignal/` (scope `/push/onesignal/`);
  **no** meter OneSignal en `sw.js` (dos registros del mismo archivo = bucle de "Nueva versión").
  Dispositivo = `external_id` (id de usuario) + tags `congregacion_id`, `rol`, `grupo_id`.
  La REST API key de OneSignal es secreta: solo en Supabase (Edge Function), nunca en el frontend.
  Envío automático: `supabase/functions/enviar-push` (webhooks de BD). Configuración paso a paso:
  `docs/NOTIFICACIONES_PUSH.md`.
- Notificaciones locales: `showSystemNotification()` marca `data.local`; el SW solo maneja el clic de esas.
- `public/sw.js`: shell precacheado, assets cache-first, Supabase GET network-first, tiles del mapa
  cache-first (máx. 600). Auth/realtime y peticiones no-GET nunca se cachean.
- Cada build marca `dist/sw.js` con un `BUILD_ID` (plugin `sw-build-id` en `vite.config.js`): cada
  despliegue es un SW nuevo y la app muestra "Nueva versión disponible". No quitar `__BUILD_ID__` de
  `public/sw.js`. Subir `CACHE_VERSION` solo si cambia la lógica de caché del SW.
- Notificaciones del sistema: usar `showSystemNotification()` de `utils/pwa.js`
  (`new Notification()` falla en Android y en la app instalada).
- Iconos: si cambia el logo, regenerar todos los PNG de `public/icons/` (ver su README).

## UI y responsivo (obligatorio)

- Mobile-first. Cada pantalla debe verse bien desde **360px** hasta escritorio, sin scroll horizontal.
- Breakpoint principal `md` (768px): debajo hay `BottomNav` (h-14) y botón de pánico abajo a la derecha;
  arriba hay `Sidebar` de 256px. No tapar esas zonas con elementos `fixed`.
- Tablas: versión tabla `hidden md:block` + versión tarjetas para móvil (patrón de `HousesList`, `UsersList`).
- Modales: usar `ModalOverlay` (tamaños `small|default|large|full`), no crear overlays nuevos a mano.
  Todo contenedor con fondo blanco fijo debe llevar la clase `light-surface` (si no, en modo oscuro
  los textos y botones `btn-outline` salen blancos sobre blanco).
- Mapas: usar `<DarkTileLayers />` (mapa oscuro con nombres de calles en blanco neón; clases
  `dark-tiles*` en `index.css`) o `<TileLayer {...LIGHT_MAP_TILES} />` para mapa claro. **No usar
  CARTO** (`basemaps.cartocdn.com`): exige API key y muestra "API KEY REQUIRED".
- **Mapa principal (`TerritoriesMap`) = solo consulta**: casas, etiquetas, progreso y ruta de visitas.
  Su popup de territorio es compacto (`TerritorioTrabajo soloLectura`) con botón "Gestionar" →
  `/territorios?id=X`. **No** agregar ahí editar/eliminar/dibujar/asignaciones/manzanas/compartir:
  todo eso vive en `TerritoriosAdmin` (`/territorios`, ancianos/ministeriales/admins), que tiene su
  propio mapa con `CustomEditControl` (`components/MapHelpers.jsx`).
- `GlobalMapFitter` encuadra solo cuando cambia el conjunto de ids o `fitKey` (antes saltaba en cada render).
- Mapa principal: por debajo de `DETAIL_ZOOM` (17) el cluster en forma de casa (`createClusterIcon`)
  "absorbe" casas y etiquetas; al hacer clic (`handleClusterClick`) vuela a zoom de detalle y aparecen
  todas las casas y las etiquetas (`ZoomAwareLabel`, píldora con color del territorio y % de avance).
- Progreso de territorios: `utils/territoryProgress.js` (según `territorio_trabajos` de los grupos;
  % = casas visitadas desde que el grupo lo tomó). Botón "Progreso" colorea los polígonos y
  `TerritoryProgressPanel` es un botón circular flotante dentro del mapa (panel sin modal).
- Todo mapa lleva `<LocateButton />`: control de Leaflet arriba a la izquierda que sigue tu ubicación
  en tiempo real (`onLocate` recibe la 1ª posición) y además hace `invalidateSize` al cambiar el
  tamaño del contenedor. No agregar botones "Usar mi ubicación" aparte.
- Puntos de color de leyenda: clase `legend-dot` (anillo para que se vean en modo oscuro).
  Todo texto de usuario dentro de `L.divIcon` debe escaparse (ver `escapeHtml`).
- Títulos de página: clase `heading-gradient` (tiene versión para modo oscuro).
- Icono de exhibidores: `ExhibidorIcon` (anaquel), no el carrito de lucide.
- Alturas de mapas/paneles: preferir `dvh` y `min(...)` (ej. `min(450px, 55dvh)`) en vez de px fijos o `vh`.
- Anchos fijos en px solo con `maxWidth` de respaldo (`calc(100% - …)`).
- Inputs con `font-size` ≥ 16px en móvil (evita zoom en iOS) — ya está en `index.css`.
- Respetar `env(safe-area-inset-*)` en elementos fijos arriba/abajo (notch, app instalada).
- Tema claro/oscuro: usar variables CSS (`var(--bg-card)`, `var(--text-primary)`, `var(--border-color)`…)
  o las clases `text-primary`, `text-secondary`, `text-muted`, `bg-card`; evitar colores fijos nuevos.
- Iconos solo de `lucide-react`.
- Gráficas en PDFs: `chartToPNG(ref, { width, height })` de `utils/chartImage.js` (redibuja la
  gráfica en PNG de alta resolución con fondo blanco); nunca `toBase64Image()` de la gráfica en pantalla.

## CSS / Tailwind v4

- Los estilos base globales (reset, `input/select/textarea`) van dentro de `@layer base { }`. Un estilo **sin capa** gana sobre todas
  las utilidades de Tailwind v4 (ya pasó: el reset `* { margin:0; padding:0 }` anulaba `p-*`, `m-*`, `space-y-*`).
- No eliminar Tailwind ni cambiar `postcss.config.js` (hubo un revert por eso).

## Convenciones de código

- Tiempo real: Supabase **no** manda DELETE a canales filtrados (p. ej. por congregación). Toda función
  de borrado en `DataContext` debe quitar el registro del estado local al confirmar. Los INSERT de
  tiempo real usan `agregarSinDuplicar` (el mismo registro puede llegar por re-fetch y por realtime).
- Listas derivadas que se pasan a efectos o a hijos (`filter`/`map`) van en `useMemo`: un array nuevo
  por render + un `setState` en un efecto = render infinito (pasó con "Mis territorios").
- Componentes funcionales con hooks; **nunca** llamar hooks después de un `return` condicional
  (ya causó pantalla en blanco en Estadísticas). `npx eslint src` lo detecta (rules-of-hooks).
- Estilo mixto existente: clases Tailwind + `style={{}}` inline. Seguir el estilo del archivo que se edita.
- Textos visibles, comentarios y mensajes de toast en español.
- **Idioma (ES/EN):** todo texto visible nuevo va con `t('Texto en español')` de `src/i18n` y su
  traducción en `src/i18n/en.js` (llave = texto exacto en español; variables `{n}`). Si en el archivo
  hay variables llamadas `t` (territorios), importar como `import { t as tx } from '../i18n'`.
  Los valores guardados en BD (estados, roles, tipos de caso) se quedan en español y solo se
  traducen al mostrarlos: `t(c.estado)`. Toda la app está traducida; los PDFs/Excel exportados
  y los mensajes de notificación guardados en BD quedan en español.
  Las columnas del Excel de importación ("Dirección", "Territorio"…) son datos: NO traducirlas.
  Configuraciones definidas fuera del componente (TIPO_CFG, ROLES…) se traducen al mostrarlas.
- Feedback al usuario con `useToast()`; confirmaciones con `ConfirmModal`.
- `import React` sin usar es la convención del repo (el lint lo marca; no es prioridad corregirlo).

## Git

- Rama `main`. Mensajes en español con prefijo: `Feat:`, `Fix:`, `Revert:`, `Task:`.
- Hacer `git pull` antes de empezar (otro colaborador sube cambios seguido).
- `npm run build` debe pasar antes de cada commit.
