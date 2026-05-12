import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase } from '../supabaseClient';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem('territorial_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    const { data, error } = await supabase
      .from('app_usuarios')
      .select('*')
      .eq('usuario', username)
      .eq('password', password)
      .single();

    if (error || !data) {
      throw new Error('Usuario o contraseña incorrectos');
    }

    if (data.activo === false) {
      throw new Error('Esta cuenta ha sido desactivada por un administrador');
    }

    const sessionUser = {
      id: data.id,
      nombre: data.nombre,
      usuario: data.usuario,
      rol: data.rol,
      foto_url: data.foto_url || null
    };
    
    setUser(sessionUser);
    localStorage.setItem('territorial_user', JSON.stringify(sessionUser));
    return sessionUser;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('territorial_user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
