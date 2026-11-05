# Changelog

## 2026-11-05 — Link compartido: punto de reunión y ubicación en vivo del grupo — requiere Migración 8

- `MIGRACION_8_PUNTO_REUNION.sql` (nuevo) + `SQL_MIGRATIONS.md`: punto de reunión en `territorio_compartidos`
- `components/PuntoReunionCompartido.jsx` (nuevo): poner el punto en el modal Compartir
- `hooks/usePresenciaCompartido.js` (nuevo): ubicaciones en vivo con Supabase Realtime (presencia, sin tablas)
- `pages/SharedTerritory3D.jsx` (bandera del punto de reunión, ruta hasta ahí, personas en vivo), `pages/SharedTerritory.jsx`
- `hooks/useTerritoriosAdmin.js`, `components/TerritorioModales.jsx`, `index.css`, `i18n/en.js`

## 2026-11-05 — Link compartido en 3D con "Cómo llegar"

- `pages/SharedTerritory3D.jsx` (nuevo): mapa 3D, ficha de casa, ruta en el mapa (OSRM de FOSSGIS) y Google Maps / Waze
- `pages/SharedTerritory.jsx` (Leaflet queda de respaldo), `components/PWAPrompts.jsx` (sin "Instalar" en `/shared`)
- `index.css` (`.m3d-compartido*`, marcadores de la ruta), `i18n/en.js`

## 2026-11-05 — Menú flotante en todas las pantallas de escritorio

- `components/MenuFlotante.jsx` (`enMapa`; sin mapa: accesos con nombre, congregación, notificaciones; colapso recordado)
- `App.jsx` (ya no usa `Sidebar`; `main` deja lugar a la columna de iconos), `index.css`

## 2026-11-05 — Menú: primero las pantallas con mapa

- `utils/menu.js`, `components/BottomNav.jsx`: Mapa principal, Registrar casa, Territorios y Exhibidores arriba; lo demás abajo

## 2026-11-05 — Nombre del usuario en neón con su rol en el menú flotante

- `components/MenuFlotante.jsx` (`NEON_ROL`: color por rol), `index.css` (`.m3d-menu__nombre`, `.m3d-menu__rol`)

## 2026-11-05 — Mapa neón, geocercas con brillo y hovers en casas y exhibidores

- `utils/map3d.js`: `aplicarNeon` (negro + calles blancas brillantes), brillo en geocercas y manzanas,
  nombres de territorio neón, `activarHoverCasas` (casita iluminada + tarjeta al pasar el mouse)
- `hooks/useMapa3D.js`, `utils/prefs3d.js` (`neon`), `components/BotonesMapa3D.jsx` (botón Neón en modo claro)
- `components/MapaFondo.jsx`, `index.css` (tarjeta `.m3d-tooltip`, hover de exhibidores, `.con-neon`), `i18n/en.js`

## 2026-11-05 — Informes de servicio (precursores y publicadores) — requiere Migración 7

- `MIGRACION_7_INFORMES.sql` (nuevo) + `SQL_MIGRATIONS.md`: `tipo_publicador` y metas en `app_usuarios`,
  tablas `registros_servicio` e `informes_servicio`
- `pages/Informes.jsx` (nuevo): Mi informe (meta, salidas, enviar) y Congregación (resumen, Excel/PDF)
- `hooks/useMiInforme.js`, `hooks/useInformesCongregacion.js`, `utils/informes.js` (nuevos)
- `UsersList.jsx` ("¿Es precursor?" y metas al dar de alta), `App.jsx`, `utils/menu.js`, `BottomNav.jsx`
- `DataContext.jsx` (cola sin conexión: `addRegistroServicio`, `guardarInformeServicio`, `recontarPendientes`)
- `i18n/en.js`

## 2026-11-05 — Exhibidores en 3D sobre el mapa de fondo compartido

- `pages/Exhibidores3D.jsx` (nuevo), `pages/Exhibidores.jsx` (respaldo clásico), `hooks/useExhibidores.js`,
  `components/ExhibidorPiezas.jsx`, `utils/menu.js` (`RUTAS_MAPA`), `index.css`, `i18n/en.js`

## 2026-11-04 — Confirmar cierre de sesión y logo nítido en el menú flotante

- `components/ConfirmarCerrarSesion.jsx` (nuevo): "¿Cerrar sesión?" en Sidebar, menú flotante y BottomNav
- `public/jw-logo.png` (nuevo): logo recortado de `JW.jpg`, 128px con esquinas transparentes
- `MenuFlotante.jsx`, `Sidebar.jsx`, `BottomNav.jsx`, `index.css`, `i18n/en.js`

## 2026-11-04 — Un solo mapa de fondo y menú flotante (estilo Google Maps)

- `context/MapaFondoContext.jsx`, `components/MapaFondo.jsx` (nuevos: un mapa 3D para todas las pantallas con mapa)
- `components/PanelMapa.jsx` (nuevo: panel abajo en móvil / dentro del menú flotante en escritorio)
- `components/MenuFlotante.jsx` (nuevo: menú arrastrable, ocultable; clic derecho lo regresa)
- `utils/menu.js` (nuevo: lista del menú compartida con la Sidebar), `utils/prefs3d.js`, `hooks/useEsMovil.js`
- `App.jsx` (mapa de fondo, menú flotante en pantallas con mapa, clic derecho bloqueado salvo en cajas de texto)
- `Sidebar.jsx`, `Vista3D.jsx`, `TerritoriesMap3D.jsx`, `RegisterHouse3D.jsx`, `TerritoriosAdmin3D.jsx`, `utils/map3d.js`
- `index.css` (capas del mapa de fondo y del menú; estados en varias filas en escritorio), `i18n/en.js`

## 2026-11-04 — 3D en escritorio y en todos los mapas (menos links compartidos y pánico)

- `components/Vista3D.jsx` (3D para todos; la clásica solo como respaldo; sin botón "Vista clásica")
- `components/MapaConRespaldo.jsx`, `components/Mapa3DEmbebido.jsx` (nuevos: mapa 3D pequeño / selector de ubicación)
- `pages/Exhibidores.jsx` (mapa de exhibidores y selector de ubicación en 3D)
- `components/EditHouseModal.jsx` (selector de ubicación en 3D, con las casas alrededor)
- `utils/webgl.js` (nuevo), `utils/map3d.js` (pin compartido), `RegisterHouse3D.jsx`
- `index.css` (escritorio: panel flotante a la izquierda; mapa embebido), `i18n/en.js`

## 2026-11-04 — Territorios y manzanas en 3D (móvil): dibujar y editar forma

- `TerritoriosAdmin.jsx` (elige vista 3D en móvil / clásica en escritorio; lógica movida a `useTerritoriosAdmin`)
- `TerritoriosAdmin3D.jsx` (nuevo: dibujar territorio, editar forma, manzanas en el mismo mapa)
- `utils/dibujo3d.js` (nuevo: Terra Draw sobre MapLibre)
- `hooks/useTerritoriosAdmin.js`, `components/TerritorioModales.jsx` (nuevos, compartidos por las dos vistas)
- `DataContext.jsx` (`updateTerritorio` / `updateManzana` reflejan el cambio al momento)
- `utils/map3d.js` (`colorRelleno`), `index.css`, `i18n/en.js`
- `package.json` (+ `terra-draw`, `terra-draw-maplibre-gl-adapter`)

## 2026-11-04 — Mapa principal en 3D (móvil) + registrar visita con un toque

- `TerritoriesMap.jsx` (elige vista 3D en móvil / clásica en escritorio; lógica movida a `useMapaPrincipal`)
- `TerritoriesMap3D.jsx` (nuevo: mapa a pantalla completa, panel de territorios / casa / ruta)
- `hooks/useMapaPrincipal.js` (nuevo: filtros, progreso, búsqueda y ruta, compartidos por las dos vistas)
- `hooks/useMapa3D.js` (nuevo: ciclo de vida del mapa MapLibre)
- `components/Vista3D.jsx`, `components/BotonesMapa3D.jsx` (nuevos)
- `DataContext.jsx` (`registrarVisita`: historial + estado, con cola sin conexión)
- `RegisterHouse.jsx`, `RegisterHouse3D.jsx` (usan lo compartido; `?territorio=X`)
- `utils/map3d.js`, `index.css` (clases `m3d-*`), `i18n/en.js`

## 2026-11-04 — Registrar casa en mapa 3D (móvil, MapLibre)

- `RegisterHouse.jsx` (elige vista 3D en móvil / clásica en escritorio o sin WebGL2)
- `RegisterHouse3D.jsx` (nuevo)
- `hooks/useGuardarCasa.js` (nuevo: guardado compartido por las dos vistas)
- `utils/map3d.js` (nuevo: estilos y capas 3D de MapLibre)
- `index.css`
- `public/sw.js` (caché de OpenFreeMap y del worker `.mjs`; `CACHE_VERSION` v5)
- `i18n/en.js`
- `package.json` (+ `maplibre-gl`)

## 2026-08-03 — Mejora Urgente 2

- `NotificationBell.jsx`
- `DataContext.jsx`
- `index.css`
- `Exhibidores.jsx`

## 2026-08-03 — Mejora urgente

- `App.jsx`
- `BottomNav.jsx`
- `Sidebar.jsx`
- `DataContext.jsx`
- `Exhibidores.jsx`
- ... y 1 archivos más

## 2026-07-08 — Mejoras v3

- `index.css`
- `HousesList.jsx`
- `RegisterHouse.jsx`
- `TerritoriesMap.jsx`

## 2026-07-08 — Mejoras v2.0

- `EditHouseModal.jsx`
- `ManzanasModal.jsx`
- `ZoomAwareLabel.jsx`
- `RegisterHouse.jsx`
- `TerritoriesMap.jsx`

## 2026-07-08 — Mejoras

- `STORAGE_SETUP.sql`
- `EditHouseModal.jsx`
- `ManzanasModal.jsx`
- `ZoomAwareLabel.jsx`
- `HousesList.jsx`
- ... y 2 archivos más

## 2026-07-07 — Cambios

- `AsignacionesModal.jsx`
- `EditHouseModal.jsx`
- `ManzanasModal.jsx`
- `ZoomAwareLabel.jsx`
- `DataContext.jsx`
- ... y 3 archivos más

## 2026-06-22 — BUG a resolver

- `AsignacionesModal.jsx`
- `DataContext.jsx`

## 2026-06-22 — correccion de bugs

- `CHANGELOG.md`
- `README.md`
- `DataContext.jsx`
- `TerritoriesMap.jsx`

## 2026-06-03 — Push  git

- `README.md`

## 2026-05-27 — Mejora de UX/UI

- `CHANGELOG.md`
- `BottomNav.jsx`
- `PanicAlert.jsx`
- `Sidebar.jsx`
- `CongregacionesList.jsx`
- ... y 3 archivos más

## 2026-05-20 — push gith


## 2026-05-20 — Mejora v15

- `CHANGELOG.md`
- `PanicAlert.jsx`
- `DashboardStats.jsx`
- `PanicHistory.jsx`

## 2026-05-20 — Mejora y graficos nuevos

- `CHANGELOG.md`
- `App.jsx`
- `PanicAlert.jsx`
- `index.css`
- `DashboardStats.jsx`
- ... y 2 archivos más

## 2026-05-20 — PUSH git


## 2026-05-20 — Mejor de UX/UI

- `CHANGELOG.md`
- `README.md`
- `ConfirmModal.jsx`
- `ModalOverlay.jsx`

## 2026-05-20 — mejora

- `ConfirmModal.jsx`
- `ModalOverlay.jsx`
- `CongregacionesList.jsx`
- `TerritoriesMap.jsx`
- `UsersList.jsx`

Registro de cambios del proyecto.

