import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

// Marca dist/sw.js con un id de build único. Así cada despliegue cambia el service worker,
// el navegador detecta la versión nueva y la app muestra "Nueva versión disponible".
// (Sin esto, sw.js solo cambiaba al editarlo a mano y el aviso casi nunca salía.)
const swBuildId = () => ({
  name: 'sw-build-id',
  apply: 'build',
  closeBundle() {
    const sw = path.resolve('dist/sw.js')
    if (!fs.existsSync(sw)) return
    const id = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
    fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace('__BUILD_ID__', id))
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), swBuildId()],
})
