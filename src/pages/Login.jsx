import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

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
              Gestión Territorial
            </h1>
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.38)' }}>
              Inicia sesión para continuar
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
                Usuario
              </label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Ej. hermano_juan"
                className="login-input"
                autoComplete="username"
              />
            </div>

            <div>
              <label
                className="block text-xs font-semibold mb-1.5 uppercase tracking-wider"
                style={{ color: 'rgba(255,255,255,0.5)' }}
              >
                Contraseña
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 mt-2 rounded-xl text-sm font-bold text-white transition-all duration-200 disabled:opacity-40"
              style={{
                background: loading ? '#2563EB' : 'linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)',
                boxShadow: '0 4px 20px rgba(59,130,246,0.4), inset 0 1px 0 rgba(255,255,255,0.15)',
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Entrando...
                </span>
              ) : 'Iniciar Sesión'}
            </button>
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
          Desarrollado por{' '}
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
