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
    <div className="relative flex flex-col min-h-screen bg-gradient-to-br from-gray-100 to-gray-200 items-center justify-center p-4">
      <div className="bg-white/80 backdrop-blur-md rounded-2xl p-8 sm:p-12 w-full max-w-sm shadow-2xl flex flex-col items-center">
        <img src="/JW.jpg" alt="JW Logo" className="w-24 h-24 rounded-2xl object-cover shadow-md mb-6" />

        <h1 className="text-2xl font-semibold text-gray-900 mb-8 text-center">
          Gestión Territorial
        </h1>

        {error && (
          <div className="bg-red-50 text-red-800 p-3 rounded-lg mb-6 w-full text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ width: '100%' }}>
          <div className="form-group" style={{ marginBottom: '1.25rem' }}>
            <label className="form-label" style={{ color: 'var(--text-secondary)' }}>Usuario</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ej. hermano_juan"
              style={{ backgroundColor: 'white' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label className="form-label" style={{ color: 'var(--text-secondary)' }}>Contraseña</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{ backgroundColor: 'white' }}
            />
          </div>

          <button type="submit" className="w-full py-3.5 text-base font-semibold btn btn-primary" disabled={loading}>
            {loading ? 'Entrando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>

      <div className="mt-8 text-gray-400 text-xs text-center">
        Desarrollado por <strong>Master Engenering EA</strong>
      </div>
    </div>
  );
};

export default Login;
