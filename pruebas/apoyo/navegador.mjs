// Navegador para las pruebas: CHROME_PATH si viene; si no, Edge en Windows o Chrome en Linux/Mac.
import fs from 'fs';

const CANDIDATOS = [
  process.env.CHROME_PATH,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export const NAVEGADOR = CANDIDATOS.find((r) => fs.existsSync(r));

// En GitHub Actions (Linux) Chrome no arranca con su sandbox (el sistema no deja crear los espacios de nombres que
// usa) y /dev/shm es chico: ahí se lanza sin sandbox. En la compu de siempre no cambia nada.
export const ARGS_EXTRA = process.env.CI ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] : [];
if (!NAVEGADOR) {
  console.error('No encontré Chrome ni Edge. Pon la ruta en la variable CHROME_PATH.');
  process.exit(1);
}
