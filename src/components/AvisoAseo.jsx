import { useMemo, useState } from 'react';
import { Sparkles, X, CalendarDays } from 'lucide-react';
import ModalOverlay from './ModalOverlay';
import { useNotifications } from '../context/NotificationContext';
import { t, getLocale } from '../i18n';
import { hora12 } from '../utils/aseo';

// Aviso del aseo del Salón (lo genera la función `recordatorios`, Migración 17): una ventana alegre con
// el versículo de la paz cuando a tu grupo le toca. Se muestra una vez (al cerrarla queda leída).

const hoyLocal = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fechaBonita = (s) => new Intl.DateTimeFormat(getLocale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${s}T12:00:00Z`));

// La tarjeta (también la usa la vista previa de la planeación)
export function TarjetaAseo({ grupo, color = '#2563EB', fecha, hora, cuando, onListo, onCerrar }) {
  return (
    <div className="relative overflow-hidden rounded-2xl" style={{ background: '#fff', color: '#0F172A' }}>
      <div className="aseo-cabecera relative px-5 pt-6 pb-5 text-center" style={{ background: `linear-gradient(135deg, ${color} 0%, #6366F1 55%, #8B5CF6 100%)`, color: '#fff' }}>
        {onCerrar && (
          <button onClick={onCerrar} aria-label={t('Cerrar')} className="absolute top-3 right-3 p-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}>
            <X size={16} />
          </button>
        )}
        <span className="aseo-brillo" style={{ left: '12%', top: '22%' }}>✦</span>
        <span className="aseo-brillo" style={{ right: '16%', top: '30%', animationDelay: '0.6s' }}>✦</span>
        <span className="aseo-brillo" style={{ left: '24%', bottom: '14%', animationDelay: '1.2s' }}>✧</span>
        <div className="mx-auto mb-3 w-14 h-14 rounded-full flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.2)' }}>
          <Sparkles size={28} />
        </div>
        {/* color directo: la regla global de <p> los pondría grises sobre el degradado */}
        <p className="text-lg sm:text-xl font-semibold italic leading-snug m-0" style={{ color: '#fff', textShadow: '0 1px 8px rgba(15,23,42,0.25)' }}>
          “{t('Porque Dios no es un Dios de desorden, sino de paz.')}”
        </p>
      </div>
      <div className="px-5 py-5 text-center">
        <p className="text-base sm:text-lg leading-relaxed m-0" style={{ color: '#0F172A' }}>
          {t('¡{grupo}, tienen el increíble privilegio de realizar el aseo del Salón del Reino!', { grupo })}
        </p>
        {fecha && (
          <p className="inline-flex items-center gap-2 mt-3 px-3 py-1.5 rounded-full text-sm font-bold" style={{ background: `${color}14`, color }}>
            <CalendarDays size={15} />
            <span>
              {cuando === 'hoy' ? t('Hoy') : cuando === 'manana' ? t('Mañana') : ''}{cuando ? ', ' : ''}{fechaBonita(fecha)}
              {hora ? ` · ${t('reunión de las {hora}', { hora: hora12(hora) })}` : ''}
            </span>
          </p>
        )}
        <p className="text-sm mt-3 m-0" style={{ color: '#475569' }}>{t('Gracias por su amor y su esfuerzo. 💙')}</p>
        {onListo && (
          <button className="btn btn-primary w-full mt-5" onClick={onListo} style={{ background: `linear-gradient(135deg, ${color}, #6366F1)` }}>
            {t('¡Ahí estaremos! 💪')}
          </button>
        )}
      </div>
    </div>
  );
}

// Global: muestra el aviso del aseo que llegue (o que esté sin leer) mientras siga vigente
export default function AvisoAseo() {
  const notif = useNotifications();
  const [cerrados, setCerrados] = useState(() => new Set());
  const aviso = useMemo(() => {
    const hoy = hoyLocal();
    return (notif?.notificaciones || []).find((n) => !n.leida && n.metadata?.tipo === 'aseo'
      && !cerrados.has(n.id) && String(n.metadata?.fecha || '') >= hoy) || null;
  }, [notif?.notificaciones, cerrados]);

  if (!aviso) return null;
  const m = aviso.metadata;
  const cerrar = () => {
    setCerrados((prev) => new Set(prev).add(aviso.id));
    Promise.resolve(notif.markAsRead(aviso.id)).catch(() => {});
  };
  return (
    <ModalOverlay onClose={cerrar} size="small">
      <div className="-m-4 sm:-m-7" data-aviso-aseo>
        <TarjetaAseo grupo={m.grupo} color={m.color || '#2563EB'} fecha={m.fecha} hora={m.hora} cuando={m.cuando} onListo={cerrar} onCerrar={cerrar} />
      </div>
    </ModalOverlay>
  );
}
