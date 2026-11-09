# Pruebas

Pruebas de punta a punta de la app y de las migraciones de seguridad. **Supabase nunca se toca**:

- **e2e/**: la app real (build de producción) en Chrome o Edge sin ventana. Todas las llamadas a
  Supabase se interceptan. Las Edge Functions (`sesion`, `webauthn`, `respaldo`) corren con su
  código **real** en Node, con un Supabase falso en memoria (`apoyo/mockSupabase.mjs`).
- **estatico/**: revisiones del código sin correr la app (traducciones).
- **sql/**: las migraciones `.sql` reales en un Postgres en memoria (PGlite), simulando cómo
  entra la app (rol `anon` + token): blindaje por congregación, contraseñas, Storage, respaldos y errores.

## Correr

```bash
npm run build      # el build que se prueba
npm run pruebas    # todas (unos 8–10 minutos)
npm run pruebas -- sesion huella   # solo algunas
```

Busca Edge o Chrome solo. Si no lo encuentra, pon su ruta en `CHROME_PATH`. El resultado de cada
una queda en `pruebas/salida/<nombre>.txt`, junto con las capturas.

| Nombre | Qué revisa |
|---|---|
| `textos` | Todo texto `t('…')` tiene su traducción en `en.js` y no hay llaves repetidas |
| `migracion11` | Contraseñas cifradas (bcrypt) en dos fases |
| `blindaje` | Migraciones 12, 13 y 14: quién ve y cambia qué, sin sesión, por rol, entre congregaciones, Storage, respaldos, errores, revertir |
| `candados` | Storage con políticas abiertas de otras apps |
| `huella` | Entrar con huella / Face ID (lector virtual) |
| `sesion` | Sesión firmada, renovación, llave cambiada, token falso |
| `passwords` | Contraseñas cifradas en la app y en las funciones |
| `reportes` | Excel, PDF y reporte interactivo de cada pantalla, y la plantilla de casas |
| `intentos` | Bloqueo por intentos, mínimo 6, importar Excel/CSV |
| `s21` | S-21: la hoja, PDF de todos (sin encimarse, ligero), PDF editable de una persona, la ventana y quién la ve |
| `registro` | Registro de asignación de territorios: cálculos (vueltas, días, olvidados) y descargas desde Grupos |
| `recordatorios` | Qué toca cada día y a quién, sin repetir, permisos, sin OneSignal, vista previa en Backup |
| `congregaciones` | La lista de Super Admin con conteos, crear y que los errores se avisen |
| `respaldos` | Respaldos automáticos, reporte de errores, pantalla amable, Backup |

**GitHub Actions** (`.github/workflows/pruebas.yml`) las corre en cada push a `main`. Si algo falla,
el push sale en rojo y los resultados se pueden descargar desde la ejecución.

Al agregar una función nueva, agrega su prueba aquí y regístrala en `correr.mjs`.
