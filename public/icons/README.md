# Iconos PWA — Instrucciones

Los archivos `icon-192.svg` e `icon-512.svg` son placeholders temporales.

## Accion requerida

Reemplazar `icon-192.png` y `icon-512.png` con el logo real de la congregacion.
Formato PNG requerido para PWA installability.

## Especificaciones

| Archivo       | Tamano    | Uso                              |
|---------------|-----------|----------------------------------|
| icon-192.png  | 192x192px | Icono general + Android home     |
| icon-512.png  | 512x512px | Splash screen + tiendas de apps  |

## Conversion SVG a PNG

Si deseas convertir los SVG placeholder a PNG temporalmente, puedes usar:
- https://cloudconvert.com/svg-to-png
- Inkscape (gratuito, de escritorio)
- ImageMagick: `magick icon-512.svg -resize 512x512 icon-512.png`

Los PNG deben colocarse en esta misma carpeta `public/icons/`.
