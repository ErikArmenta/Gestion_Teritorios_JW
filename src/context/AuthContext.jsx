import React, { createContext, useState, useEffect, useContext } from 'react';
import { supabase, actualizarTokenRealtime } from '../supabaseClient';
import { t } from '../i18n';
import { olvidarUsuario } from '../utils/onesignal';
import { entrarConBiometria } from '../utils/webauthn';
import { entrarEnServidor, renovarSiToca, guardarToken, olvidarToken } from '../utils/sesion';

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

  // Sesión firmada: al abrir la app (una vez al día, con internet) se renueva el token y se traen
  // rol/congregación al día. Cuenta desactivada o borrada → se cierra la sesión.
  useEffect(() => {
    if (!localStorage.getItem('territorial_user')) return;
    let vivo = true;
    renovarSiToca().then((r) => {
      if (!vivo || !r) return;
      guardarToken(r);
      actualizarTokenRealtime();
      setUser((prev) => {
        if (!prev || prev.id !== r.usuario.id) return prev;
        const nuevo = { ...prev, ...r.usuario };
        if (JSON.stringify(nuevo) === JSON.stringify(prev)) return prev;
        localStorage.setItem('territorial_user', JSON.stringify(nuevo));
        return nuevo;
      });
    }).catch((err) => {
      if (!vivo) return;
      if (err?.codigo === 'desactivada' || err?.codigo === 'credenciales') cerrarSesion();
      else if (err?.codigo === 'token_invalido') olvidarToken();
    });
    return () => { vivo = false; };
  }, []);

  const guardarSesion = (u, firma) => {
    const sessionUser = {
      id: u.id,
      nombre: u.nombre,
      usuario: u.usuario,
      rol: u.rol,
      foto_url: u.foto_url || null,
      congregacion_id: u.congregacion_id || null,
      congregacion_nombre: u.congregacion_nombre || null,
    };
    guardarToken(firma); // sin token (función sin secreto) = llave pública, como antes
    actualizarTokenRealtime();
    setUser(sessionUser);
    localStorage.setItem('territorial_user', JSON.stringify(sessionUser));
    return sessionUser;
  };

  const login = async (username, password) => {
    // 1) En el servidor (Edge Function `sesion`): revisa la contraseña allá y entrega el token firmado
    try {
      const r = await entrarEnServidor(username, password);
      return guardarSesion(r.usuario, r);
    } catch (err) {
      if (err?.codigo === 'desactivada') throw new Error(t('Esta cuenta ha sido desactivada por un administrador'), { cause: err });
      if (err?.codigo === 'credenciales') throw new Error(t('Usuario o contraseña incorrectos'), { cause: err });
      // 'no_disponible' (función sin desplegar, sin internet hacia ella…) → el login de siempre
    }
    return loginDirecto(username, password);
  };

  // Login de siempre (directo a la tabla con la llave pública). Respaldo hasta que se blinden las tablas.
  const loginDirecto = async (username, password) => {
    const { data, error } = await supabase
      .from('app_usuarios')
      .select('*')
      .eq('usuario', username)
      .eq('password', password)
      .single();

    if (error || !data) {
      throw new Error(t('Usuario o contraseña incorrectos'));
    }

    if (data.activo === false) {
      throw new Error(t('Esta cuenta ha sido desactivada por un administrador'));
    }

    const sessionUser = {
      id: data.id,
      nombre: data.nombre,
      usuario: data.usuario,
      rol: data.rol,
      foto_url: data.foto_url || null,
      congregacion_id: data.congregacion_id || null,
      congregacion_nombre: null,
    };

    if (data.congregacion_id) {
      const { data: congData } = await supabase
        .from('congregaciones')
        .select('nombre')
        .eq('id', data.congregacion_id)
        .single();
      sessionUser.congregacion_nombre = congData?.nombre || null;
    }

    return guardarSesion(sessionUser, null);
  };

  // Entrar con huella / Face ID: la Edge Function `webauthn` ya verificó la firma y devuelve el usuario
  // (y el token de sesión si la firma de sesiones está configurada)
  const loginConBiometria = async () => {
    const r = await entrarConBiometria();
    return guardarSesion(r.usuario, r);
  };

  function cerrarSesion() {
    olvidarUsuario(); // el dispositivo deja de recibir push de este usuario
    olvidarToken();
    actualizarTokenRealtime();
    setUser(null);
    localStorage.removeItem('territorial_user');
  }
  const logout = cerrarSesion;

  const updateProfile = async (updates) => {
    const { error } = await supabase
      .from('app_usuarios')
      .update(updates)
      .eq('id', user.id);

    if (error) throw error;

    const safeFields = {};
    if (updates.nombre !== undefined) safeFields.nombre = updates.nombre;
    if (updates.foto_url !== undefined) safeFields.foto_url = updates.foto_url;

    const updatedUser = { ...user, ...safeFields };
    setUser(updatedUser);
    localStorage.setItem('territorial_user', JSON.stringify(updatedUser));
    return { success: true };
  };

  return (
    <AuthContext.Provider value={{ user, login, loginConBiometria, logout, loading, updateProfile }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
