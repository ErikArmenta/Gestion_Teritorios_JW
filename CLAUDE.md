# Reglas del proyecto — Gestión Territorial JW

App web (PWA) para gestionar territorios de predicación: mapa de territorios y manzanas,
registro de casas y visitas, exhibidores con turnos, alertas de pánico y notificaciones.
Multi-congregación. Desarrollada por Master Engenering EA. Idioma de la UI: **español**.

## Stack

- React 19 + Vite 8 (JSX, sin TypeScript), React Router 7
- Tailwind CSS v4 (`@tailwindcss/postcss`) + CSS propio en `src/index.css`
- Supabase (`src/supabaseClient.js`) — solo base de datos/storage/realtime, **no** Supabase Auth
- Leaflet / react-leaflet 5 / leaflet-draw / react-leaflet-cluster / Turf
- MapLibre GL 6 + OpenFreeMap (mapa 3D, gratis y sin API key) — todos los mapas (móvil y escritorio, también links compartidos) menos pánico; dibujo con Terra Draw
- Chart.js, jsPDF + autotable, exceljs (exportar), xlsx (solo leer importaciones), lucide-react (iconos)
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
- `src/components/` — modales, navegación (`MenuFlotante` escritorio, `BottomNav` móvil), pánico, notificaciones, `PWAPrompts`
- `src/context/` — `AuthContext` (sesión), `DataContext` (territorios/casas + offline + realtime), `NotificationContext`, `ThemeContext`
- `src/utils/` — `constants.js` (estados, colores, roles), `offlineStore.js` (IndexedDB), `pwa.js` (SW, instalación, notificaciones)
- `public/` — `sw.js`, `manifest.json`, `favicon.svg`, `icons/` (logo de mapa), `JW.jpg` (logo de la barra lateral/login)

## Roles y permisos

`Super Admin` > `Admin Principal` > `Anciano` / `Ministerial` > `Publicador`.

- El acceso por ruta se define con `ProtectedRoute allowedRoles={[...]}` en `App.jsx`.
- Menús: el menú flotante (escritorio, todas las pantallas) usa la lista de `utils/menu.js` (`MENU_ITEMS` con `roles`,
  primero las pantallas con mapa);
  la `BottomNav` (móvil) tiene su propia lista. Al agregar/cambiar una pantalla, actualizar `App.jsx`,
  `utils/menu.js` **y** `BottomNav.jsx`.
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
- **Informes de servicio** (Migración 7, `MIGRACION_7_INFORMES.sql`): pantalla `/informes` (todos los roles).
  Cada usuario es `tipo_publicador` = Publicador / Precursor auxiliar / Precursor regular (se elige al dar de
  alta en Usuarios, para cualquier rol). Precursores: el formulario tiene una casilla de horas por concepto
  (casa en casa, cartas, teléfono, exhibidor, informal + servicio sagrado aparte, que **no** suma a las horas),
  horas libres (0–24) y minutos de 5 en 5; al guardar se crea un `registros_servicio` por concepto con tiempo
  (`agregarRegistros`, un solo insert; revisitas y nota van en el concepto con más tiempo; el día no pasa de
  24 h). "Mi meta" e informe muestran el desglose (`totalesDe().porTipo`). Ven su avance contra su meta
  (`meta_horas_mensual`; el regular también `meta_horas_anual` del año de servicio sept–ago) y envían el
  informe del mes (`informes_servicio`, uno por usuario y mes, upsert). Publicadores: casilla "Prediqué" +
  estudios, y además anotan servicio sagrado (`FormSalida soloSagrado`; va en `horas_servicio_sagrado`).
  Ancianos/ministeriales/admins ven "Congregación" (resumen por tipo, quién falta, Excel/PDF en
  español). Lógica: `hooks/useMiInforme.js`, `hooks/useInformesCongregacion.js`, `utils/informes.js`.
  Si la migración no existe la pantalla avisa y Usuarios no manda esos campos (detecta la columna).
  - **Actividad** (pestaña para los mismos roles, `hooks/useActividadCongregacion.js`, `estadoActividad()`):
    actividad = informe con "Prediqué", horas de predicación o visitas en el mapa (`historial_visitas`, por
    `usuario_id` de los miembros); el servicio sagrado no cuenta. Activo = este mes o el anterior (los
    publicadores informan al terminar el mes); Sin predicar; Inactivo = N meses completos sin actividad.
    N es por congregación (`congregaciones.meses_inactividad`, Migración 9, `MIGRACION_9_ACTIVIDAD.sql`);
    lo cambian Anciano/Admin/Super Admin; sin la migración se guarda solo en el dispositivo.
- Migraciones nuevas: además de documentarlas en `SQL_MIGRATIONS.md`, dejar un `.sql` puro y
  re-ejecutable (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`) para pegar en Supabase.

## Datos (Supabase)

Tablas principales: `app_usuarios`, `congregaciones`, `territorios`, `territorio_manzanas`,
`territorio_asignaciones`, `territorio_compartidos`, `casas`, `historial_visitas`, `fotos_casas`,
`notas_voz`, `exhibidores`, `exhibidor_turnos`, `alertas_panico`, `notificaciones`,
`registros_servicio`, `informes_servicio` (Migración 7).

- Cambios de esquema: documentarlos en `SQL_MIGRATIONS.md` (y storage en `STORAGE_SETUP.sql`).
- Antes de usar una columna, confirmar que existe (ya hubo bugs por columnas inexistentes, p. ej. `telefono`).
- Si un `select` con relación da error de "relación ambigua", especificar la FK: `app_usuarios!fk_nombre(...)`.
- Estados de casa: usar `STATUS_COLORS` / `STATUS_OPTIONS` de `constants.js`, nunca strings sueltos.
- **Entrar con huella / Face ID** (Migración 10, `MIGRACION_10_WEBAUTHN.sql` + Edge Function
  `supabase/functions/webauthn`, pasos en `docs/ENTRAR_CON_HUELLA.md`): WebAuthn con passkeys
  (`@simplewebauthn/browser` en `utils/webauthn.js`; `@simplewebauthn/server` en la función). Retos y llaves
  públicas en `webauthn_retos` / `webauthn_credenciales` (RLS sin políticas: **solo** la función, nunca la anon key).
  Activar pide la contraseña otra vez (Mi Perfil, `components/BiometriaPerfil.jsx`); el botón del login
  (`loginConBiometria` de `AuthContext`) solo aparece si hay lector en el aparato y la acción `estado` responde.
  Ícono Huella/Face ID = preferencia del usuario (`localStorage biometria_icono`); el teléfono decide el método.
  Orígenes permitidos: secreto `WEBAUTHN_ORIGENES` (las llaves van ligadas al dominio).
- **Sesión firmada** (blindaje paso 1, `docs/SESION_SEGURA.md`): `login` llama primero a la Edge Function
  `supabase/functions/sesion` (revisa la contraseña en el servidor y devuelve `{ usuario, token?, expira? }`);
  si no está desplegada usa el login directo de siempre (`loginDirecto`). El token (JWT con `role: 'anon'`,
  `usuario_id`, `congregacion_id`, `app_rol`, `grupo_id`; firmado con el secreto `SESION_JWT_SECRET` o
  `SESION_JWK_PRIVADA`) se guarda en `localStorage territorial_token` (`utils/sesion.js`) y `supabaseClient`
  lo manda en cada consulta (`accessToken`; por eso **no** usar `supabase.auth`). Si Supabase lo rechaza,
  `fetchConRespaldo` lo olvida y repite con la llave pública. Se renueva una vez al día (`renovarSiToca`);
  cuenta desactivada/borrada → se cierra la sesión. `webauthn` firma igual (si cambias el formato, cambia ambas).
  Las funciones prueban el token contra la BD antes de entregarlo.
- **Contraseñas cifradas** (blindaje paso 2, Migración 11 + 11B): bcrypt en `app_usuarios.password_hash`
  (disparador `trg_app_usuarios_cifrar_password`; con 11B la columna `password` queda siempre `NULL`).
  Revisarlas **solo** en el servidor con `verificar_password` (rpc, solo service role) — funciones `sesion`
  (`entrar`, `cambiar-password`) y `webauthn`; sin la migración caen a la comparación de siempre.
  Nunca leer ni comparar `password` desde el navegador para algo nuevo. Usuarios: al editar, contraseña
  vacía = no cambiarla (no mandar `password`); sin texto plano se muestra "Cifrada".
- **Blindaje paso 3 (Migración 12, `MIGRACION_12_BLINDAJE.sql`; deshacer: `MIGRACION_12_REVERTIR.sql`)**: RLS por
  congregación leyendo el token (`jw_usuario_id()`; rol y congregación desde la BD con `jw_rol()`/`jw_congregacion()`;
  políticas `jw_*`). **El proyecto de Supabase lo comparten otras apps**: nunca tocar tablas que no sean de esta app.
  Tabla nueva → su política `jw_*` en una migración; columna nueva en `app_usuarios` → `GRANT SELECT (col)`.
  Disparador `trg_app_usuarios_proteger` (qué columnas cambia cada rol). La app ya está lista:
  - **Nunca** `select('*')` en `app_usuarios`: la BD no dejará leer `password`/`password_hash`. Usar
    `seleccionarUsuarios()` / `COLUMNAS_USUARIO_BASE` de `utils/usuarios.js`.
  - El link compartido pide sus datos con la función `compartido_datos(p_id)` (sin sesión); sin ella, las
    consultas de siempre.
  - `seguridad_config.blindaje = 'si'` → las funciones lo avisan (`blindaje: true`) y la app no deja sesiones
    sin token (pide entrar otra vez; `EVENTO_SESION_INVALIDA` en `utils/sesion.js`).
  - Diagnóstico de la estructura real: `DIAGNOSTICO_BLINDAJE.sql` (solo lee).
- Backup: solo exporta/restaura la congregación del usuario; restaurar **no** borra usuarios (upsert; borrar
  un usuario borra en cascada informes, huellas y asignaciones).
- Riesgo conocido: el login de respaldo (`loginDirecto`) compara usuario/contraseña directo contra `app_usuarios`
  con la anon key, y la tabla sigue legible con la anon key hasta el paso 3 del blindaje (permisos RLS que lean el token).
  No exponer más datos sensibles por esa vía; cualquier mejora de seguridad debe coordinarse con el dueño.

## Offline y PWA

- `DataContext` guarda territorios/casas en IndexedDB y encola escrituras sin conexión (`pendingQueue`);
  las operaciones nuevas de escritura sobre casas deben pasar por esa cola (tipos: `addCasa`, `registrarVisita`,
  `addRegistroServicio`, `guardarInformeServicio`). Quien escriba en la cola sin pasar por `DataContext` debe
  llamar `recontarPendientes()`: la sincronización solo arranca con `pendingCount > 0`.
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
- `public/sw.js`: shell precacheado, assets cache-first (incluye `.mjs`: worker de MapLibre), Supabase
  GET network-first, tiles del mapa cache-first (máx. 600). OpenFreeMap: estilos y `/planet` network-first
  (cambian cada semana), mosaicos/fuentes/sprites cache-first. Auth/realtime y peticiones no-GET nunca se cachean.
- Cada build marca `dist/sw.js` con un `BUILD_ID` (plugin `sw-build-id` en `vite.config.js`): cada
  despliegue es un SW nuevo y la app muestra "Nueva versión disponible". No quitar `__BUILD_ID__` de
  `public/sw.js`. Subir `CACHE_VERSION` solo si cambia la lógica de caché del SW.
- Notificaciones del sistema: usar `showSystemNotification()` de `utils/pwa.js`
  (`new Notification()` falla en Android y en la app instalada).
- Iconos: si cambia el logo, regenerar todos los PNG de `public/icons/` (ver su README).

## UI y responsivo (obligatorio)

- Mobile-first. Cada pantalla debe verse bien desde **360px** hasta escritorio, sin scroll horizontal.
- Breakpoint principal `md` (768px): debajo hay `BottomNav` (h-14) y botón de pánico abajo a la derecha;
  arriba está el menú flotante (columna de iconos de 60px a la izquierda; `main` lleva `md:pl-[100px]`). No tapar esas
  zonas con elementos `fixed`.
- Tablas: versión tabla `hidden md:block` + versión tarjetas para móvil (patrón de `HousesList`, `UsersList`).
- Modales: usar `ModalOverlay` (tamaños `small|default|large|full`), no crear overlays nuevos a mano.
  Todo contenedor con fondo blanco fijo debe llevar la clase `light-surface` (si no, en modo oscuro
  los textos y botones `btn-outline` salen blancos sobre blanco).
- **Mapas 2D (Leaflet) solo en**: alertas de pánico (`PanicAlert`, `PanicHistory`) y como **respaldo
  automático** de los mapas 3D (sin WebGL2 o si el 3D falla).
- **Link compartido** (`/shared/:id`, público, sin sesión): `SharedTerritory.jsx` carga `SharedTerritory3D.jsx`
  (import dinámico; su propio `useMapa3D`, no el mapa de fondo) y deja su Leaflet como respaldo. Solo consulta:
  territorio, casas (ficha al tocar) y "Cómo llegar": ruta en coche de tu ubicación al centro del territorio
  con el OSRM de FOSSGIS (`routing.openstreetmap.de`, el de openstreetmap.org; **solo al tocar el botón**,
  si falla se dibuja línea recta) + botones a Google Maps / Waze. Ahí no se ofrece instalar la PWA.
  - **Punto de reunión** (Migración 8, `MIGRACION_8_PUNTO_REUNION.sql`): columnas `punto_reunion_lat/lng/nota`
    en `territorio_compartidos`. Se pone (opcional) en el modal Compartir (`components/PuntoReunionCompartido.jsx`,
    UPDATE después de crear el link; sin la migración avisa). Si existe, "Cómo llegar" lleva ahí.
  - **En vivo** (`hooks/usePresenciaCompartido.js`): Supabase Realtime **presencia**, canal `compartido:<id>`,
    sin tablas (nada se guarda). Solo aparece quien toca "Compartir mi ubicación"; nombre = el de su sesión
    o el que escribe (`localStorage compartido_nombre`); llave fija por dispositivo (`compartido_dispositivo`).
    Máx. una posición cada 8 s (quieto, una por minuto); Wake Lock mientras comparte. Nombres de otros =
    texto de usuario → `textContent`. En desarrollo las pruebas pueden inyectar `window.__canalPresenciaFalso`.
    La vista 2D de respaldo muestra el punto de reunión pero no el "en vivo".
  Para esos mapas: `<DarkTileLayers />` (mapa oscuro con nombres de calles en blanco neón; clases
  `dark-tiles*` en `index.css`) o `<TileLayer {...LIGHT_MAP_TILES} />` para mapa claro. **No usar
  CARTO** (`basemaps.cartocdn.com`): exige API key y muestra "API KEY REQUIRED".
  Todo lo demás es 3D (MapLibre): ver "Mapas 3D" abajo.
- **Mapa principal (`TerritoriesMap3D`, y su respaldo `TerritoriesMap`) = solo consulta**: casas, etiquetas, progreso y ruta de visitas.
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
  tamaño del contenedor. No agregar botones "Usar mi ubicación" aparte. En mapas MapLibre el
  equivalente es `GeolocateControl` (arriba a la izquierda, `trackUserLocation`).
- **Mapas 3D (MapLibre), móvil y escritorio**: el mapa principal (`TerritoriesMap3D`), "Registrar casa"
  (`RegisterHouse3D`), Territorios (`TerritoriosAdmin3D`) y Exhibidores (`Exhibidores3D`) se abren en 3D a pantalla completa si hay WebGL2.
  `components/Vista3D.jsx` (`ElegirVista`) pone la vista clásica (Leaflet) solo como respaldo: sin WebGL2
  o si el 3D truena (`Fallo3D`); ahí la clásica muestra "Mapa 3D" para reintentar. Ya no hay botón
  "Vista clásica" (la preferencia vieja `localStorage vista_mapas` se ignora). Las pantallas 3D se cargan
  con import dinámico. Mapas pequeños dentro de modales (Editar casa):
  `components/MapaConRespaldo.jsx` → `Mapa3DEmbebido` (`modo="selector"` con pin al centro, o
  `modo="puntos"`); recibe el Leaflet de siempre en `clasico` como respaldo.
  - **Un solo mapa de fondo** para las pantallas con mapa (`RUTAS_MAPA` en `utils/menu.js`):
    `context/MapaFondoContext.jsx` + `components/MapaFondo.jsx` (se monta una vez, al salir solo se oculta;
    al volver aparece al instante). Cada pantalla usa `useMapaPagina({ datos, alCrear })`: `datos` = fuentes
    GeoJSON (de `useMemo`; lo que no mande queda vacío) y `alCrear(map, geo)` registra sus eventos y **debe
    devolver la función que los quita** (el mapa sigue vivo). Campana, botones 3D/satélite y aviso de sin
    conexión los pone `MapaFondo` (una vez). El contexto se carga con la app: no importar MapLibre ahí.
  - Panel de cada pantalla: `components/PanelMapa.jsx` (`cabecera` + contenido). Móvil: cabecera arriba y
    panel abajo; reporta su alto para que el mapa termine encima. Escritorio: va por portal dentro del
    **menú flotante** (`components/MenuFlotante.jsx`, `enMapa`): iconos (`utils/menu.js`) + panel; se arrastra (posición en `localStorage menu_flotante_pos`),
    se oculta, y con **clic derecho** regresa a su lugar. En las pantallas sin mapa el mismo menú flota
    sobre el contenido con accesos con nombre y notificaciones (rol y congregación van arriba en la barra, en todas las pantallas); se colapsa a la columna de
    iconos y eso se recuerda (`localStorage menu_flotante_oculto`). `Sidebar.jsx` ya no se usa.
  - Clic derecho del navegador bloqueado en toda la app (`App.jsx`), salvo en cajas de texto.
  - Lógica compartida clásica/3D — los cambios van ahí, no en cada vista:
    `hooks/useMapaPrincipal.js` (filtro "Mis territorios", progreso, búsqueda, ruta de visitas) y
    `hooks/useGuardarCasa.js` (guardar casa nueva: foto, nota de voz, cola offline).
  - `hooks/useMapa3D.js`: crea el mapa (crédito, `GeolocateControl`, brújula), cambia estilo y 2D/3D y
    actualiza las fuentes GeoJSON (cada una de un `useMemo`). Botones flotantes: `components/BotonesMapa3D.jsx`.
  - Layout: `.m3d` es `fixed`, `z-index: 40` (pánico, nav, modales y toasts quedan encima).
    Móvil: entre el borde superior y la `BottomNav`; mapa arriba y panel abajo (no se enciman); lo que
    queda en la parte baja del panel (estados, listas, botones, `.m3d-pie`) lleva `margin-right: 84px`
    para no quedar bajo el botón de pánico. Escritorio (`md+`): detrás del menú flotante, mapa
    a todo lo ancho y el panel flota a la izquierda (`min(400px, 46%)`); los controles del mapa se corren
    a la derecha del panel.
    El contenedor del mapa usa `.m3d .m3d-canvas` (doble clase): `.maplibregl-map { position: relative }`
    le ganaba según el orden de los CSS y el mapa salía en blanco.
  - Mapa principal 3D: también **solo consulta**. Panel con lista de territorios (progreso), ficha de
    territorio (Ruta de visitas, Registrar casa → `/register?territorio=X`, Gestionar) y ficha de casa
    (registrar visita con un toque = `registrarVisita` de `DataContext`, Editar → `EditHouseModal`,
    llamar, cómo llegar, historial).
  - Exhibidores 3D: marcadores DOM con nombre (`textContent`, color con `style`); nuevo exhibidor = pin al
    centro del mapa de fondo + formulario en el panel. Lógica compartida con la clásica: `hooks/useExhibidores.js`
    y `components/ExhibidorPiezas.jsx` (modal de asignar turno, eliminar, tarjeta de "Mis turnos").
  - Registrar casa 3D: pin fijo al centro; territorio y manzana se detectan con Turf según el pin (el
    usuario puede cambiarlos). `?territorio=X` abre sobre ese territorio ya elegido.
  - Territorios 3D (`TerritoriosAdmin3D`): lista → ficha (progreso y grupo con `TerritorioTrabajo`,
    Editar forma, Manzanas, Editar datos, Asignaciones, Compartir, Eliminar) → manzanas en el mismo mapa.
    Lógica y modales compartidos con la clásica: `hooks/useTerritoriosAdmin.js` y `components/TerritorioModales.jsx`
    (la clásica sigue con `leaflet-draw` y `ManzanasModal`).
  - Dibujo en MapLibre: `utils/dibujo3d.js` (Terra Draw: polígono, rectángulo y `select` para mover vértices).
    Al dibujar el mapa se pone plano (pitch 0) y se ocultan los botones de estilo (un `setStyle` borra las capas
    de Terra Draw; si pasa, la sesión se cancela). Coordenadas: mismo formato de siempre `[[lat, lng], ...]`
    sin repetir el primer punto (lo leen la vista clásica, los links compartidos y el pánico).
    Una manzana que se sale del territorio pide confirmación.
  - Editar la forma de un territorio manda su propio `congregacion_id` (`guardarForma`): `updateTerritorio`
    pone la del usuario si no viene y un Super Admin lo movería de congregación.
- `utils/map3d.js` (MapLibre): estilos OpenFreeMap (`positron` claro, `dark` oscuro) y satélite Esri
  (lleva atribución), capas propias (`agregarCapas`, se vuelven a poner en cada `style.load`), worker con
  `setWorkerUrl`. Las capas 3D van después de la última capa que no es texto del estilo (si no, el
  estilo oscuro pinta encima de los techos). En muchas colonias OSM casi no tiene edificios: el 3D sale
  de las casas de la app y de lo seleccionado. Casas: de lejos ícono de casita del color del estado (capa
  `casas-punto`, tipo symbol, hasta zoom 17.5) y de cerca casita 3D (`casaPartes`: paredes + techo de dos
  aguas escalonado, desde zoom 16.5); lo seleccionado = casita amarilla (`seleccionCasaGeoJSON`). Los íconos
  se dibujan en canvas con `map.setMissingStyleImageResolver` (MapLibre 6; el evento `styleimagemissing`
  solo llega si el resolver no da la imagen). Exhibidores: `crearMarcadorExhibidor` (pin con el anaquel),
  también en el mapa principal (solo consulta: ficha con "Ver turnos" → `/exhibidores?id=X`).
  El punto azul y el círculo de "mi ubicación" llevan `pointer-events: none` (si no, no dejaban dibujar encima).
  - **Mapa neón** (negro con calles blancas brillantes): `aplicarNeon(map)` repinta el estilo `dark` y agrega
    la capa `neon-calles`. Siempre en modo oscuro; en modo claro solo con el botón Neón (`prefs.neon`, en
    `utils/prefs3d.js`, se recuerda en todos los mapas). Satélite manda sobre neón. Con el botón Neón visible
    `MapaFondo` pone `.con-neon` y en escritorio los controles del mapa bajan un lugar (no se enciman).
    Geocercas y manzanas llevan una línea de brillo (`*-brillo`, `line-blur`); nombres de territorio en
    texto blanco con halo del color del territorio sobre mapa oscuro/satélite.
  - Hover (solo con mouse, `(hover: hover)`): `activarHoverCasas(map)` (lo llama `MapaFondo`) ilumina la
    casita 3D (`feature-state hover`, `promoteId: 'id'` en las fuentes de casas) y muestra la tarjeta
    `.m3d-tooltip` (dirección + estado, con `textContent`). Exhibidores: brillo y escala por CSS.
  Texto de usuario en MapLibre: capas `symbol` o `textContent` en popups, nunca `innerHTML`.
- "Sugerir dirección" usa Nominatim (OSM) **solo al tocar el botón** (su política: ≤ 1 petición/seg, sin
  consultas automáticas).
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
- **Reportes (Excel, PDF y "Reporte interactivo")**: un solo modelo de reporte (`utils/reportes/comun.js`, ahí
  está documentado) y tres salidas con la marca de la app: `excel.js` (exceljs: logo, encabezados de color,
  filtros, totales, formatos de número), `pdf.js` (jsPDF: portada, tarjetas, gráficas, tablas) e `interactivo.js`
  (un archivo que se abre en el navegador, sin internet: tema claro/oscuro, gráficas con detalle, tablas con
  búsqueda/orden; en la app **nunca** se dice "HTML"). Gráficas en SVG propio (`graficas.js`, al PDF van como PNG).
  En las pantallas: `<BotonesExportar armar={() => modelo} />` (`components/BotonesExportar.jsx`, carga todo
  con import dinámico). Secciones y columnas con `en: ['excel','pdf','html']`. Teléfonos/contactos de casas solo
  en Excel (el reporte interactivo se comparte). Texto de usuario siempre escapado (`escapar`). Los documentos van en español.
  Plantilla de importar casas: `exportarPlantilla` (la fila 1 y el orden de columnas los lee `HousesList`; no cambiarlos).
  `xlsx` (SheetJS) se queda solo para **leer** el Excel de importación.

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
