# Changelog

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

