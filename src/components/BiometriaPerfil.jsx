import React, { useEffect, useState } from 'react';
import { Fingerprint, ScanFace, ShieldCheck, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import ConfirmModal from './ConfirmModal';
import { t } from '../i18n';
import {
  lectorDisponible, estadoBiometria, iconoBiometria, guardarIconoBiometria,
  credencialLocal, activarBiometria, quitarBiometria,
} from '../utils/webauthn';

// Mi Perfil → activar / quitar la entrada con huella o Face ID en este aparato (Migración 10).
// Si el servidor no tiene la migración ni la función `webauthn`, la tarjeta no aparece.
const BiometriaPerfil = () => {
  const { user } = useAuth();
  const toast = useToast();
  const [estado, setEstado] = useState('cargando'); // cargando | oculto | sin_lector | listo
  const [icono, setIcono] = useState(iconoBiometria);
  const [activa, setActiva] = useState(() => !!credencialLocal(user?.id));
  const [password, setPassword] = useState('');
  const [trabajando, setTrabajando] = useState(false);
  const [confirmarQuitar, setConfirmarQuitar] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const servidor = await estadoBiometria();
      const lector = servidor && await lectorDisponible();
      if (vivo) setEstado(!servidor ? 'oculto' : lector ? 'listo' : 'sin_lector');
    })();
    return () => { vivo = false; };
  }, []);

  if (estado === 'cargando' || estado === 'oculto') return null;

  const rostro = icono === 'rostro';
  const Icono = rostro ? ScanFace : Fingerprint;

  const elegir = (v) => { setIcono(v); guardarIconoBiometria(v); };

  const activar = async () => {
    if (!password) { toast.error(t('Escribe tu contraseña para activarla')); return; }
    setTrabajando(true);
    try {
      await activarBiometria(user.id, password);
      setActiva(true);
      setPassword('');
      toast.success(rostro ? t('Listo: ya puedes entrar con Face ID') : t('Listo: ya puedes entrar con tu huella'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTrabajando(false);
    }
  };

  const quitar = async () => {
    setConfirmarQuitar(false);
    setTrabajando(true);
    try {
      await quitarBiometria(user.id);
      setActiva(false);
      toast.success(t('Se quitó de este dispositivo'));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setTrabajando(false);
    }
  };

  const opcion = (valor, IconoOpc, texto) => (
    <button
      type="button"
      onClick={() => elegir(valor)}
      aria-pressed={icono === valor}
      className="flex-1 min-w-0 flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-sm font-semibold transition-all"
      style={icono === valor
        ? { background: 'rgba(37,99,235,0.12)', color: 'var(--primary-color)', border: '1.5px solid var(--primary-color)' }
        : { background: 'transparent', color: 'var(--text-secondary)', border: '1.5px solid var(--border-color)' }}
    >
      <IconoOpc size={18} className="shrink-0" />
      <span className="truncate">{texto}</span>
    </button>
  );

  return (
    <div className="card" style={{ marginBottom: '1.25rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Icono size={17} style={{ color: 'var(--primary-color)' }} />
        {t('Entrar con huella o Face ID')}
      </h2>
      <p className="text-secondary" style={{ fontSize: '0.8125rem', marginBottom: '1rem' }}>
        {t('Entra sin escribir tu contraseña. Tu huella o tu rostro nunca salen de tu teléfono.')}
      </p>

      {estado === 'sin_lector' ? (
        <p className="text-muted" style={{ fontSize: '0.8125rem' }}>
          {t('Este dispositivo no tiene huella ni Face ID disponibles en el navegador.')}
        </p>
      ) : (
        <>
          <label className="form-label">{t('¿Cómo desbloqueas tu teléfono?')}</label>
          <div className="flex gap-2">
            {opcion('huella', Fingerprint, t('Huella'))}
            {opcion('rostro', ScanFace, t('Face ID'))}
          </div>
          <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.375rem', marginBottom: '1rem' }}>
            {t('Cambia el botón de la pantalla de entrada. El teléfono usa el método que tengas configurado.')}
          </p>

          {activa ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: '#059669' }}>
                <ShieldCheck size={17} /> {t('Activada en este dispositivo')}
              </span>
              <button type="button" className="btn btn-outline" onClick={() => setConfirmarQuitar(true)} disabled={trabajando}>
                {trabajando ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
                {t('Quitar')}
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">{t('Confirma tu contraseña')}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') activar(); }}
                  placeholder={t('Tu contraseña actual')}
                  autoComplete="current-password"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-primary" onClick={activar} disabled={trabajando}>
                  {trabajando ? <Loader2 size={15} className="animate-spin" /> : <Icono size={15} />}
                  {rostro ? t('Activar Face ID') : t('Activar huella')}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {confirmarQuitar && (
        <ConfirmModal
          message={t('¿Quitar la entrada con huella de este dispositivo?')}
          detail={t('Podrás seguir entrando con tu contraseña y activarla otra vez cuando quieras.')}
          confirmText={t('Quitar')}
          cancelText={t('Cancelar')}
          danger
          onConfirm={quitar}
          onCancel={() => setConfirmarQuitar(false)}
        />
      )}
    </div>
  );
};

export default BiometriaPerfil;
