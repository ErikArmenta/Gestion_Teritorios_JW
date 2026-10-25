// Supabase Edge Function: enviar-push
// La llaman los Database Webhooks de Supabase cuando se inserta/actualiza una fila y manda
// la notificación push por OneSignal a las personas que corresponde, con su link de navegación.
//
//   alertas_panico      INSERT → toda la congregación (menos quien la activó)   → /alerts
//   territorio_trabajos INSERT → publicadores del grupo asignado              → /
//   territorio_trabajos UPDATE → (terminado) publicadores del grupo            → /
//   notificaciones      INSERT → el usuario destinatario                       → según tipo
//
// Secretos (Supabase → Edge Functions → Secrets):
//   ONESIGNAL_APP_ID, ONESIGNAL_REST_API_KEY, APP_URL (https://tu-dominio), WEBHOOK_SECRET
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase automáticamente.

import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (k: string) => Deno.env.get(k) ?? '';
const APP_URL = env('APP_URL').replace(/\/$/, '');
const supabase = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

type Texto = { es: string; en: string };
type Push = { usuarios: (string | number)[]; titulo: Texto; mensaje: Texto; ruta: string };

const TIPO_ALERTA: Record<string, Texto> = {
  seguridad: { es: 'Seguridad', en: 'Security' },
  medica: { es: 'Médica', en: 'Medical' },
  accidente: { es: 'Accidente', en: 'Accident' },
};

// Rutas de la app según el tipo de notificación interna
const RUTA_NOTIFICACION: Record<string, string> = {
  alerta: '/alerts',
  asignacion: '/',
  desasignacion: '/',
  exhibidor: '/exhibidores',
  exhibidor_respuesta: '/exhibidores',
};

async function enviar({ usuarios, titulo, mensaje, ruta }: Push) {
  const ids = [...new Set(usuarios.map(String))];
  if (!ids.length) return { omitido: 'sin destinatarios' };
  const res = await fetch('https://api.onesignal.com/notifications?c=push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${env('ONESIGNAL_REST_API_KEY')}`,
    },
    body: JSON.stringify({
      app_id: env('ONESIGNAL_APP_ID'),
      target_channel: 'push',
      include_aliases: { external_id: ids },
      headings: titulo,
      contents: mensaje,
      url: `${APP_URL}${ruta}`, // link de navegación al tocar la notificación
      chrome_web_icon: `${APP_URL}/icons/notification-icon.png`,
      priority: 10,
    }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function usuariosDe(filtro: { congregacion_id?: string; grupo_id?: number }, excluir?: number) {
  // Activos = activo true o sin valor (cuentas viejas)
  let q = supabase.from('app_usuarios').select('id').or('activo.is.null,activo.eq.true');
  if (filtro.congregacion_id) q = q.eq('congregacion_id', filtro.congregacion_id);
  if (filtro.grupo_id) q = q.eq('grupo_id', filtro.grupo_id);
  const { data } = await q;
  return (data ?? []).map((u) => u.id).filter((id) => id !== excluir);
}

async function nombreTerritorio(id: number) {
  const { data } = await supabase.from('territorios').select('numero, nombre').eq('id', id).single();
  return [data?.numero, data?.nombre].filter(Boolean).join(' · ') || `#${id}`;
}

async function nombreGrupo(id: number) {
  const { data } = await supabase.from('grupos_predicacion').select('nombre').eq('id', id).single();
  return data?.nombre ?? '';
}

// deno-lint-ignore no-explicit-any
async function construir(evento: any): Promise<Push | null> {
  const { table, type, record, old_record } = evento;

  if (table === 'alertas_panico' && type === 'INSERT') {
    const { data: emisor } = await supabase.from('app_usuarios').select('nombre').eq('id', record.usuario_id).single();
    const tipo = TIPO_ALERTA[record.tipo] ?? { es: record.tipo, en: record.tipo };
    const nombre = emisor?.nombre ?? 'Un compañero';
    return {
      usuarios: await usuariosDe({ congregacion_id: record.congregacion_id }, record.usuario_id),
      titulo: { es: '🚨 ALERTA DE EMERGENCIA', en: '🚨 EMERGENCY ALERT' },
      mensaje: { es: `${nombre} necesita ayuda — ${tipo.es}`, en: `${nombre} needs help — ${tipo.en}` },
      ruta: '/alerts',
    };
  }

  if (table === 'territorio_trabajos' && record.grupo_id) {
    const territorio = await nombreTerritorio(record.territorio_id);
    const grupo = await nombreGrupo(record.grupo_id);
    if (type === 'INSERT' && record.estado === 'en_progreso') {
      return {
        usuarios: await usuariosDe({ grupo_id: record.grupo_id }),
        titulo: { es: '📍 Territorio asignado a tu grupo', en: '📍 Territory assigned to your group' },
        mensaje: { es: `${grupo}: ${territorio}`, en: `${grupo}: ${territorio}` },
        ruta: '/',
      };
    }
    if (type === 'UPDATE' && record.estado === 'completado' && old_record?.estado !== 'completado') {
      return {
        usuarios: await usuariosDe({ grupo_id: record.grupo_id }),
        titulo: { es: '✅ Territorio terminado', en: '✅ Territory finished' },
        mensaje: { es: `${grupo} terminó ${territorio}. ¡Buen trabajo!`, en: `${grupo} finished ${territorio}. Great job!` },
        ruta: '/',
      };
    }
    return null;
  }

  if (table === 'notificaciones' && type === 'INSERT' && record.usuario_destino_id) {
    // El texto lo escribió la app al crear la notificación: se manda igual en ambos idiomas
    const titulo = record.titulo ?? 'Notificación';
    const mensaje = record.mensaje ?? '';
    return {
      usuarios: [record.usuario_destino_id],
      titulo: { es: titulo, en: titulo },
      mensaje: { es: mensaje || titulo, en: mensaje || titulo },
      ruta: RUTA_NOTIFICACION[record.tipo] ?? '/',
    };
  }

  return null;
}

Deno.serve(async (req) => {
  // Solo los webhooks de Supabase (con la clave compartida) pueden mandar notificaciones
  if (req.headers.get('x-webhook-secret') !== env('WEBHOOK_SECRET')) {
    return new Response('No autorizado', { status: 401 });
  }
  try {
    const evento = await req.json();
    const push = await construir(evento);
    const resultado = push ? await enviar(push) : { omitido: `${evento.table} ${evento.type}` };
    console.log(evento.table, evento.type, JSON.stringify(resultado));
    return Response.json(resultado);
  } catch (err) {
    console.error(err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
});
