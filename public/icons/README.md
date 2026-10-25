# Iconos PWA

El logo de la app es un mapa plegado con un pin de ubicación.

| Archivo                 | Tamaño  | Uso                                          |
|-------------------------|---------|----------------------------------------------|
| `../favicon.svg`        | vector  | Pestaña del navegador (dibujo ampliado)      |
| `icon.svg`              | vector  | Fuente del icono con esquinas redondeadas    |
| `icon-maskable.svg`     | vector  | Fuente del icono maskable (fondo completo)   |
| `icon-192.png`          | 192x192 | Icono general / Android                      |
| `icon-512.png`          | 512x512 | Splash screen / instalación                  |
| `icon-maskable-512.png` | 512x512 | Android adaptive icon (`purpose: maskable`)  |
| `apple-touch-icon.png`  | 180x180 | Pantalla de inicio en iOS                    |

## Regenerar PNGs

Si cambias los SVG, vuelve a exportar los PNG con el mismo nombre y tamaño
(Inkscape, ImageMagick o Chrome headless con `--screenshot`).
