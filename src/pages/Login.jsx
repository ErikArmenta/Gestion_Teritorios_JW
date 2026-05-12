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
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: '#f3f4f6',
      backgroundImage: 'linear-gradient(135deg, #f3f4f6 0%, #e5e7eb 100%)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(12px)',
        borderRadius: '16px',
        padding: '3rem 2rem',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}>
        <img src="/JW.jpg" alt="JW Logo" style={{
          width: '100px', height: '100px', borderRadius: '16px',
          objectFit: 'cover', boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
          marginBottom: '1.5rem'
        }} />
        
        <h1 style={{ margin: '0 0 2rem 0', color: 'var(--text-primary)', fontSize: '1.5rem', fontWeight: 600 }}>
          Gestión Territorial
        </h1>

        {error && (
          <div style={{ backgroundColor: '#FEF2F2', color: '#991B1B', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', width: '100%', fontSize: '0.875rem', textAlign: 'center' }}>
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

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', padding: '0.875rem', fontSize: '1rem', fontWeight: 600 }}>
            {loading ? 'Entrando...' : 'Iniciar Sesión'}
          </button>
        </form>
      </div>

      <div style={{ position: 'absolute', bottom: '2rem', color: '#9CA3AF', fontSize: '0.75rem', textAlign: 'center' }}>
        Desarrollado por <strong>Master Engenering EA</strong>
      </div>
    </div>
  );
};

export default Login;
