# Changelog

## 2026-11-06 — Registro de publicador (S-21) automático — Migración 15

- Informes → Congregación → "S-21": llena el formulario oficial con los informes del año de servicio; "Descargar todos"
  (una hoja por publicador, ~1 MB por 100, en menos de un segundo) o el de una persona (editable)
- Captura de datos personales (fechas, sexo, esperanza, nombramiento, servicio especial) solo para secretario/ancianos/admins
- `utils/s21.js`, `hooks/useRegistroS21.js`, `components/RegistroS21.jsx`, `public/formularios/S-21-S.pdf` (nuevos);
  dependencia `pdf-lib`; `MIGRACION_15_REGISTRO_S21.sql`; prueba `s21` y permisos en `blindaje`; `i18n/en.js`

## 2026-11-06 — Respaldos automáticos, avisos de errores y pruebas en el repo — Migración 14

- `supabase/functions/respaldo` (nuevo) + `MIGRACION_14_RESPALDOS_ERRORES.sql` + `MIGRACION_14B_PROGRAMAR_RESPALDO.sql`:
  respaldo semanal comprimido en bucket privado (últimos 12), "Respaldar ahora" y descarga para Super Admin
- `utils/errores.js`, `components/ErrorPantalla.jsx` (nuevos): errores reportados a `errores_app`; aviso amable en vez de
  pantalla en blanco; `components/RespaldosAutomaticos.jsx` y `components/ErroresApp.jsx` en Backup
- `pruebas/` (nuevo): 9 suites (e2e + SQL) con `npm run pruebas`; `.github/workflows/pruebas.yml` en cada push
- `docs/RESPALDOS.md`, `pruebas/README.md`, `SQL_MIGRATIONS.md`, `CLAUDE.md`, `i18n/en.js`
- Traducciones al inglés que faltaban desde el paso 3 (reportes, seguridad, respaldos); nueva prueba `textos` que lo vigila

## 2026-11-06 — Seguridad: Storage, límite de intentos, contraseñas de 6 y fuera SheetJS — Migración 13

- `MIGRACION_13_SEGURIDAD.sql` / `MIGRACION_13_REVERTIR.sql` (nuevos): subir fotos/audios solo con sesión, tamaños
  máximos, `login_intentos`; reporte que avisa si faltan contraseñas por cifrar (11B)
- Funciones `sesion` y `webauthn`: bloqueo tras 5 fallos (usuario) o 20 (IP) por 15 min; contraseña nueva mínimo 6
- App: mensaje "Demasiados intentos", mínimo 6 en Mi Perfil y Usuarios
- `utils/leerTabla.js` (nuevo): importar casas sin SheetJS; se quitó la dependencia `xlsx` (vulnerabilidades);
  `react-router-dom` 7.18.4, `dompurify` y `fflate` actualizados (avisos de seguridad)

## 2026-11-06 — Congregación junto al rol y logo bien recortado en los reportes

- `components/MenuFlotante.jsx` + `index.css`: el nombre de la congregación sube a la barra, debajo del rol (también en pantallas con mapa)
- `utils/reportes/comun.js`: el logo se recorta solo al ícono (JW.jpg es 1200×630) con esquinas transparentes; sin marco blanco en PDF y reporte interactivo

## 2026-11-06 — Reportes con formato de la app: Excel, PDF y "Reporte interactivo"

- `utils/reportes/` (nuevo): modelo de reporte único + `excel.js` (exceljs), `pdf.js`, `interactivo.js` y `graficas.js` (SVG)
- `components/BotonesExportar.jsx` (nuevo): Excel · PDF · Reporte interactivo
- Estadísticas, Alertas, Informes (Congregación y Actividad — esta ahora también con PDF y reporte interactivo)
- Plantilla de casas con formato, listas desplegables de Territorio/Estado e instrucciones (mismo formato de importación)
- Dependencia `exceljs` (se carga solo al exportar); se quitó `utils/chartImage.js`; `i18n/en.js`

## 2026-11-06 — Blindaje paso 3: Migración 12 (RLS por congregación)

- `MIGRACION_12_BLINDAJE.sql` (nuevo): permisos por congregación en las 16 tablas de la app (solo esas: el proyecto
  lo comparten otras apps), contraseñas ilegibles, `compartido_datos`, relleno de `congregacion_id` vacío, reporte
- `MIGRACION_12_REVERTIR.sql` (nuevo): deshace el blindaje en un paso
- `SQL_MIGRATIONS.md`, `docs/SESION_SEGURA.md` (paso 3), `CLAUDE.md`

## 2026-11-06 — Blindaje paso 3 (preparación) + arreglo de Backup

- `pages/Backup.jsx`: restaurar ya **no borra las casas de todas las congregaciones** ni borra usuarios (upsert);
  exportar solo trae lo de tu congregación y falla en vez de generar un respaldo vacío
- `utils/usuarios.js` (nuevo): columnas explícitas de `app_usuarios` (`pages/UsersList.jsx`, Backup)
- `pages/SharedTerritory.jsx`: datos por `compartido_datos` (con respaldo a las consultas de siempre)
- `utils/sesion.js`, `supabaseClient.js`, `context/AuthContext.jsx`, `pages/Login.jsx`: sesión obligatoria cuando la BD
  esté blindada (sin efecto hasta la Migración 12); funciones `sesion` (acción `estado`) y `webauthn` avisan `blindaje`
- `DIAGNOSTICO_BLINDAJE.sql` (nuevo, solo lee la estructura), `i18n/en.js`

## 2026-11-06 — Blindaje paso 2: contraseñas cifradas (bcrypt) — Migración 11 (fase 1) y 11B (fase 2)

- `MIGRACION_11_PASSWORDS.sql` (nuevo): `password_hash`, disparador que cifra, `verificar_password` (solo servidor)
- `MIGRACION_11B_SIN_TEXTO_PLANO.sql` (nuevo): borra el texto plano
- `supabase/functions/sesion` (revisa la cifrada; acción `cambiar-password`), `supabase/functions/webauthn`
- `pages/Profile.jsx` (cambiar contraseña por el servidor), `pages/UsersList.jsx` ("Cifrada"; al editar, vacía = no cambiar),
  `utils/sesion.js`, `SQL_MIGRATIONS.md`, `docs/SESION_SEGURA.md`, `i18n/en.js`

## 2026-11-06 — Blindaje paso 1: sesión firmada por el servidor — Edge Function `sesion` opcional

- `supabase/functions/sesion/index.ts` (nuevo): login revisado en el servidor + token firmado (HS256 legacy o ES256
  propia), renovación diaria; prueba el token contra la BD antes de entregarlo
- `supabase/functions/webauthn/index.ts`: entrar con huella también entrega el token
- `utils/sesion.js` (nuevo), `supabaseClient.js` (token en cada consulta + respaldo a la llave pública si se rechaza),
  `context/AuthContext.jsx` (login por el servidor con respaldo al de siempre, renovación, cierre si se desactiva)
- `pages/Profile.jsx`: "Sesión protegida por el servidor"; `docs/SESION_SEGURA.md` (nuevo), `i18n/en.js`

## 2026-11-06 — Entrar con huella / Face ID (WebAuthn) — Migración 10 + Edge Function `webauthn` opcionales

- `pages/Login.jsx`: botón de huella / Face ID junto a "Iniciar Sesión" (solo si el aparato y el servidor lo permiten)
- `components/BiometriaPerfil.jsx` (nuevo) en Mi Perfil: elegir Huella o Face ID, activar (con contraseña) y quitar
- `utils/webauthn.js` (nuevo), `context/AuthContext.jsx` (`loginConBiometria`), dependencia `@simplewebauthn/browser`
- `supabase/functions/webauthn/index.ts` (nuevo): retos de un solo uso y verificación de firmas en el servidor
- `MIGRACION_10_WEBAUTHN.sql` (nuevo, tablas blindadas con RLS) + `SQL_MIGRATIONS.md` + `docs/ENTRAR_CON_HUELLA.md`
- `i18n/en.js`

## 2026-11-06 — Informes: horas por concepto, servicio sagrado para publicadores y pestaña Actividad — Migración 9 opcional

- `pages/Informes.jsx`: una casilla de horas por concepto (horas libres 0–24, minutos de 5 en 5) que se suman;
  desglose por concepto en "Mi meta", el informe y el Excel; salidas agrupadas por día; aviso si el informe ya
  enviado quedó viejo; revisitas con un toque desde las visitas del mapa
- Publicadores: siguen con "Prediqué" + estudios y además anotan servicio sagrado
- Pestaña "Actividad" (ancianos, ministeriales, admins): activos, sin predicar, inactivos, tiempo sin predicar,
  filtro, búsqueda y Excel — `hooks/useActividadCongregacion.js`, `utils/informes.js`
- `MIGRACION_9_ACTIVIDAD.sql` (nuevo) + `SQL_MIGRATIONS.md`: meses para inactivo por congregación
- `hooks/useMiInforme.js`, `hooks/useInformesCongregacion.js`, `i18n/en.js`

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

