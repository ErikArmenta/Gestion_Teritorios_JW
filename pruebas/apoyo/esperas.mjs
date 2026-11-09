// Ayudas para que las pruebas no dependan de la velocidad de la máquina (en GitHub Actions todo es más lento):
// en vez de "esperar 2 segundos y revisar", se espera HASTA que pase lo esperado (con un tope).

const TOPE = 20000;

// Espera a que `fn` (corre en la página) devuelva algo verdadero. Devuelve true/false, nunca truena.
export const hastaQue = async (page, fn, arg, ms = TOPE) => {
  try { await page.waitForFunction(fn, { timeout: ms, polling: 100 }, arg); return true; } catch { return false; }
};

// Lo mismo, pero la condición corre en Node (p. ej. revisar la BD de prueba).
export const hastaQueNode = async (cond, ms = TOPE) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

// Pone el valor de un campo como lo haría el usuario (React lo ve), sin clics por coordenadas ni teclado:
// así no importa si algo fijo (barra de abajo, botón de pánico, aviso) tapa el campo con otras fuentes.
export const escribir = (page, sel, valor) => page.$eval(sel, (el, v) => {
  const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}, valor);

// Clic por JavaScript (no por coordenadas).
export const clicSel = (page, sel) => page.$eval(sel, (el) => el.click());
