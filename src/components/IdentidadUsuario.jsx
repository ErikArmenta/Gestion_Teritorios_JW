import React from 'react';
import { Building2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { NEON_ROL } from '../utils/menu';
import { t } from '../i18n';

// Nombre del usuario en neón (color según el rol), su rol y su congregación. En el celular va arriba en las
// pantallas sin mapa (App.jsx) y en el menú "Más" (BottomNav); en escritorio lo muestra el menú flotante.
const IdentidadUsuario = ({ className = '' }) => {
  const { user } = useAuth();
  if (!user) return null;
  const neon = NEON_ROL[user.rol] || NEON_ROL.Publicador;
  return (
    <div className={`identidad ${className}`} style={{ '--neon': neon }} data-identidad>
      <span className="m3d-menu__nombre identidad__nombre" title={user.nombre}>{user.nombre}</span>
      {(user.rol || user.congregacion_nombre) && (
        <span className="identidad__fila">
          {user.rol && <span className="m3d-menu__rol">{t(user.rol)}</span>}
          {user.congregacion_nombre && (
            <span className="m3d-menu__congre identidad__congre" title={user.congregacion_nombre}>
              <Building2 size={12} className="shrink-0" />
              <span className="truncate">{user.congregacion_nombre}</span>
            </span>
          )}
        </span>
      )}
    </div>
  );
};

export default IdentidadUsuario;
