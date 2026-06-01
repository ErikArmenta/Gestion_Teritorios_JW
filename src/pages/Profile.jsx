import React, { useState, useRef } from 'react';
import { Camera, Lock, User, Shield, Building2, AtSign, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../components/Toast';
import { supabase } from '../supabaseClient';

const ROLE_STYLES = {
  'Super Admin':     { bg: 'rgba(37,99,235,0.1)',   color: '#2563EB' },
  'Admin Principal': { bg: 'rgba(124,58,237,0.1)',  color: '#7C3AED' },
  'Anciano':         { bg: 'rgba(5,150,105,0.1)',   color: '#059669' },
  'Ministerial':     { bg: 'rgba(217,119,6,0.1)',   color: '#D97706' },
  'Publicador':      { bg: 'rgba(100,116,139,0.1)', color: '#475569' },
};

const Profile = () => {
  const { user, updateProfile } = useAuth();
  const { uploadPhoto } = useData();
  const toast = useToast();
  const photoInputRef = useRef(null);

  // ── Info form state ──
  const [nombre, setNombre] = useState(user?.nombre || '');
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [savingInfo, setSavingInfo] = useState(false);

  // ── Password form state ──
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPass, setSavingPass]           = useState(false);

  const roleStyle = ROLE_STYLES[user?.rol] || ROLE_STYLES['Publicador'];

  const initial = (user?.nombre || user?.usuario || '?')[0].toUpperCase();

  // ── Handle photo selection ──
  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  };

  // ── Save name + photo ──
  const handleSaveInfo = async () => {
    if (!nombre.trim()) {
      toast.error('El nombre no puede estar vacío');
      return;
    }
    setSavingInfo(true);
    try {
      let foto_url = user?.foto_url || null;

      if (photoFile) {
        foto_url = await uploadPhoto(photoFile);
      }

      await updateProfile({ nombre: nombre.trim(), foto_url });
      toast.success('Perfil actualizado correctamente');
      setPhotoFile(null);
      setPhotoPreview(null);
    } catch (err) {
      toast.error('Error al guardar: ' + (err.message || 'Inténtalo de nuevo'));
    } finally {
      setSavingInfo(false);
    }
  };

  // ── Change password ──
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error('Completa todos los campos de contraseña');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('La nueva contraseña y la confirmación no coinciden');
      return;
    }
    if (newPassword.length < 4) {
      toast.error('La nueva contraseña debe tener al menos 4 caracteres');
      return;
    }

    setSavingPass(true);
    try {
      // Verify current password
      const { data, error: fetchError } = await supabase
        .from('app_usuarios')
        .select('password')
        .eq('id', user.id)
        .single();

      if (fetchError || !data) throw new Error('No se pudo verificar la contraseña actual');
      if (data.password !== currentPassword) {
        toast.error('La contraseña actual es incorrecta');
        return;
      }

      const { error: updateError } = await supabase
        .from('app_usuarios')
        .update({ password: newPassword })
        .eq('id', user.id);

      if (updateError) throw updateError;

      toast.success('Contraseña actualizada correctamente');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      toast.error('Error: ' + (err.message || 'Inténtalo de nuevo'));
    } finally {
      setSavingPass(false);
    }
  };

  return (
    <div className="animate-page-in" style={{ maxWidth: 640, margin: '0 auto', padding: '1.5rem 1rem' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 className="heading-gradient" style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
          Mi Perfil
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          Administra tu información personal y seguridad
        </p>
      </div>

      {/* ── Card principal: info ── */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <User size={17} style={{ color: 'var(--primary-color)' }} />
          Información personal
        </h2>

        {/* Photo + fields row */}
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>

          {/* Photo */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.625rem', flexShrink: 0 }}>
            <div style={{ position: 'relative', width: 96, height: 96 }}>
              {(photoPreview || user?.foto_url) ? (
                <img
                  src={photoPreview || user.foto_url}
                  alt="Foto de perfil"
                  style={{
                    width: 96, height: 96, borderRadius: '50%',
                    objectFit: 'cover',
                    border: '3px solid rgba(37,99,235,0.2)',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                  }}
                />
              ) : (
                <div style={{
                  width: 96, height: 96, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '2rem', fontWeight: 700, color: '#fff',
                  boxShadow: '0 4px 16px rgba(37,99,235,0.25)',
                  flexShrink: 0,
                }}>
                  {initial}
                </div>
              )}

              {/* Camera button */}
              <button
                onClick={() => photoInputRef.current?.click()}
                style={{
                  position: 'absolute', bottom: 2, right: 2,
                  width: 28, height: 28, borderRadius: '50%',
                  background: '#2563EB', border: '2px solid #fff',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', boxShadow: '0 2px 8px rgba(37,99,235,0.4)',
                  transition: 'transform 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                title="Cambiar foto"
              >
                <Camera size={13} color="#fff" />
              </button>
            </div>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />
            {photoFile && (
              <span style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 600 }}>
                Nueva foto lista
              </span>
            )}
          </div>

          {/* Fields */}
          <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

            {/* Nombre */}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Nombre completo</label>
              <input
                type="text"
                value={nombre}
                onChange={e => setNombre(e.target.value)}
                placeholder="Tu nombre completo"
              />
            </div>

            {/* Usuario (readonly) */}
            <div>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <AtSign size={12} />
                Usuario de acceso
              </label>
              <div style={{
                padding: '0.625rem 0.875rem',
                border: '1.5px solid #E2E8F0',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                color: 'var(--text-muted)',
                background: 'rgba(0,0,0,0.02)',
                userSelect: 'all',
              }}>
                {user?.usuario}
              </div>
            </div>

            {/* Rol + Congregación */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 120 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <Shield size={12} />
                  Rol
                </label>
                <div style={{ paddingTop: '0.25rem' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center',
                    padding: '0.3rem 0.75rem',
                    borderRadius: 9999,
                    fontSize: '0.75rem', fontWeight: 700,
                    letterSpacing: '0.02em',
                    background: roleStyle.bg, color: roleStyle.color,
                    border: `1px solid ${roleStyle.color}30`,
                  }}>
                    {user?.rol}
                  </span>
                </div>
              </div>

              <div style={{ flex: 1, minWidth: 140 }}>
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <Building2 size={12} />
                  Congregación
                </label>
                <div style={{
                  padding: '0.625rem 0.875rem',
                  border: '1.5px solid #E2E8F0',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                  color: 'var(--text-muted)',
                  background: 'rgba(0,0,0,0.02)',
                }}>
                  {user?.congregacion_nombre || '—'}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Save button */}
        <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary"
            onClick={handleSaveInfo}
            disabled={savingInfo}
          >
            {savingInfo ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
            {savingInfo ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      </div>

      {/* ── Card: Cambiar Contraseña ── */}
      <div className="card">
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Lock size={17} style={{ color: 'var(--primary-color)' }} />
          Cambiar Contraseña
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Contraseña actual</label>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Ingresa tu contraseña actual"
              autoComplete="current-password"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Nueva contraseña</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Mínimo 4 caracteres"
              autoComplete="new-password"
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Confirmar nueva contraseña</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Repite la nueva contraseña"
              autoComplete="new-password"
            />
            {confirmPassword && newPassword !== confirmPassword && (
              <p style={{ fontSize: '0.75rem', color: '#DC2626', marginTop: '0.375rem' }}>
                Las contraseñas no coinciden
              </p>
            )}
          </div>
        </div>

        <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary"
            onClick={handleChangePassword}
            disabled={savingPass}
          >
            {savingPass ? <Loader2 size={15} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
            {savingPass ? 'Actualizando...' : 'Actualizar Contraseña'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default Profile;
