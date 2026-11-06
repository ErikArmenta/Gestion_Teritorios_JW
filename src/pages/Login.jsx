import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Languages, Fingerprint, ScanFace } from 'lucide-react';
import { t, useLanguage } from '../i18n';
import { lectorDisponible, estadoBiometria, iconoBiometria } from '../utils/webauthn';

const Spinner = () => (
  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
  </svg>
);

const Login = () => {
  const { lang, toggleLang } = useLanguage();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Aviso que dejó la app al cerrar la sesión por seguridad (blindaje)
  const [error, setError] = useState(() => {
    try {
      const aviso = sessionStorage.getItem('aviso_login');
      if (aviso) sessionStorage.removeItem('aviso_login');
      return aviso ? t(aviso) : '';
    } catch { return ''; }
  });
  const [loading, setLoading] = useState(false);
  const [bio, setBio] = useState(false); // botón de huella / Face ID (solo si el aparato y el servidor lo permiten)
  const [loadingBio, setLoadingBio] = useState(false);
  const { login, loginConBiometria } = useAuth();
  const navigate = useNavigate();
  const rostro = iconoBiometria() === 'rostro';
  const IconoBio = rostro ? ScanFace : Fingerprint;

  useEffect(() => {
    let vivo = true;
    (async () => {
      const ok = (await lectorDisponible()) && (await estadoBiometria());
      if (vivo) setBio(ok);
    })();
    return () => { vivo = false; };
  }, []);

  const handleBio = async () => {
    setError('');
    setLoadingBio(true);
    try {
      await loginConBiometria();
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingBio(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex flex-col min-h-dvh items-center justify-center p-4"
      style={{
        background: 'radial-gradient(ellipse at 60% 0%, rgba(37,99,235,0.18) 0%, transparent 60%), linear-gradient(160deg, #0A0F1E 0%, #0F172A 50%, #0C1326 100%)',
      }}
    >
      {/* Idioma */}
      <button
        type="button"
        onClick={toggleLang}
        className="fixed top-4 right-4 z-10 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold"
        style={{ marginTop: 'env(safe-area-inset-top)', color: 'rgba(255,255,255,0.75)', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }}
      >
        <Languages size={14} /> {lang === 'es' ? 'English' : 'Español'}
      </button>
      <div className="w-full max-w-sm animate-fade-in">
        {/* Logo FUERA del card, encima */}
        <div className="flex flex-col items-center mb-[-3rem] relative z-10">
          <div
            className="w-36 h-36 rounded-3xl overflow-hidden shadow-xl animate-logo-entrance"
            style={{
              boxShadow: '0 0 0 3px rgba(59,130,246,0.4), 0 12px 40px rgba(59,130,246,0.25), 0 0 60px rgba(59,130,246,0.15)',
            }}
          >
            <img src="/JW.jpg" alt="JW Logo" className="w-full h-full object-cover" />
          </div>
        </div>

        {/* Card glassmorphism */}
        <div
          className="rounded-3xl pt-20 pb-8 px-8 sm:px-10 shadow-2xl animate-fade-in"
          style={{
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
            animationDelay: '0.2s',
          }}
        >
          {/* Título */}
          <div className="flex flex-col items-center mb-8">
            <h1
              className="text-3xl font-bold text-white tracking-tight text-center"
              style={{
                textShadow: '0 0 15px rgba(255,255,255,0.6), 0 0 40px rgba(255,255,255,0.3), 0 0 80px rgba(255,255,255,0.15)',
              }}
            >
              {t('Gestión Territorial')}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.38)' }}>
              {t('Inicia sesión para continuar')}
            </p>
          </div>

          {/* Error */}
          {error && (
            <div
              className="rounded-xl p-3 mb-5 text-sm text-center font-medium animate-fade-in"
              style={{
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.25)',
                color: '#FCA5A5',
              }}
            >
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                {t('Usuario')}
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('Ej. hermano_juan')}
                className="login-input"
                autoComplete="username"
              />
            </div>

            <div>
              <label
                className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                {t('Contraseña')}
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="login-input"
                autoComplete="current-password"
              />
            </div>

            <div className="flex gap-3 mt-2">
              {bio && (
                <button
                  type="button"
                  onClick={handleBio}
                  disabled={loadingBio || loading}
                  title={rostro ? t('Entrar con Face ID') : t('Entrar con huella')}
                  aria-label={rostro ? t('Entrar con Face ID') : t('Entrar con huella')}
                  className="shrink-0 flex items-center justify-center rounded-xl text-white transition-all duration-200 disabled:opacity-40 active:scale-95"
                  style={{
                    width: 52,
                    background: 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                    boxShadow: '0 4px 20px rgba(59,130,246,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
                  }}
                >
                  {loadingBio ? <Spinner /> : <IconoBio size={26} strokeWidth={1.8} />}
                </button>
              )}
              <button
                type="submit"
                disabled={loading || loadingBio}
                className="flex-1 min-w-0 py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-200 disabled:opacity-40"
                style={{
                  background: loading ? '#2563EB' : 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                  boxShadow: '0 4px 20px rgba(59,130,246,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
                }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    {t('Entrando...')}
                  </span>
                ) : t('Iniciar Sesión')}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <p
          className="text-center text-xs mt-10"
          style={{
            color: 'rgba(255,255,255,0.7)',
            textShadow: '0 0 10px rgba(255,255,255,0.5), 0 0 30px rgba(255,255,255,0.3), 0 0 60px rgba(255,255,255,0.15)',
          }}
        >
          {t('Desarrollado por')}{' '}
          <span
            style={{
              color: 'rgba(255,255,255,0.9)',
              textShadow: '0 0 8px rgba(255,255,255,0.6), 0 0 25px rgba(255,255,255,0.4)',
            }}
          >
            Master Engenering EA
          </span>
        </p>
      </div>
    </div>
  );
};

export default Login;
