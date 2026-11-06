import { createClient } from '@supabase/supabase-js';
import { tokenVigente, olvidarToken } from './utils/sesion';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Si Supabase rechaza el token de sesión (llave cambiada o revocada), se olvida y la consulta se
// repite con la llave pública: la app nunca se queda sin datos por un token malo.
const RECHAZO_TOKEN = /jwt|jws|signature|PGRST30/i;
const fetchConRespaldo = async (input, init = {}) => {
  const res = await fetch(input, init);
  if (res.status !== 400 && res.status !== 401 && res.status !== 403) return res;
  const headers = new Headers(init.headers);
  const enviado = headers.get('Authorization');
  if (!enviado || enviado === `Bearer ${supabaseKey}`) return res;
  const texto = await res.clone().text().catch(() => '');
  if (!RECHAZO_TOKEN.test(texto)) return res;
  console.warn('Token de sesión rechazado; se usa la llave pública');
  olvidarToken();
  headers.set('Authorization', `Bearer ${supabaseKey}`);
  return fetch(input, { ...init, headers });
};

// accessToken: el token firmado de la sesión (utils/sesion.js) o, si no hay, la llave pública de siempre.
// (La app no usa Supabase Auth; con esta opción supabase.auth queda deshabilitado.)
export const supabase = createClient(supabaseUrl, supabaseKey, {
  accessToken: async () => tokenVigente() ?? supabaseKey,
  global: { fetch: fetchConRespaldo },
});

// Después de entrar/salir: el tiempo real toma el token nuevo
export const actualizarTokenRealtime = () => { supabase.realtime.setAuth().catch?.(() => {}); };
