import React from 'react';
import { Share2, Copy } from 'lucide-react';
import ModalOverlay from './ModalOverlay';
import ConfirmModal from './ConfirmModal';
import AsignacionesModal from './AsignacionesModal';
import PuntoReunionCompartido from './PuntoReunionCompartido';
import { useToast } from './Toast';
import { t as tx } from '../i18n';

// Modales de "Gestión de Territorios" (nuevo, editar, asignaciones, compartir, eliminar).
// Los usan la vista clásica y la 3D con el estado de hooks/useTerritoriosAdmin.js (`admin`).

const TerritorioForm = ({ form, setForm, congregaciones, pedirCongregacion }) => (
  <>
    <div className="form-group">
      <label className="form-label">{tx('Número del territorio')}</label>
      <input value={form.numero} onChange={e => setForm(f => ({ ...f, numero: e.target.value }))} placeholder={tx('Ej: 1, 2, T-3 (opcional)')} />
    </div>
    <div className="form-group">
      <label className="form-label">{tx('Nombre *')}</label>
      <input required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder={tx('Ej: Zona Norte')} />
    </div>
    <div className="form-group">
      <label className="form-label">{tx('Descripción')}</label>
      <textarea rows={3} value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
    </div>
    <div className="form-group">
      <label className="form-label">{tx('Responsable')}</label>
      <input value={form.responsable} onChange={e => setForm(f => ({ ...f, responsable: e.target.value }))} placeholder={tx('Nombre del responsable')} />
    </div>
    {pedirCongregacion && (
      <div className="form-group">
        <label className="form-label">{tx('Congregación *')}</label>
        <select required value={form.congregacion_id_override} onChange={e => setForm(f => ({ ...f, congregacion_id_override: e.target.value }))}>
          <option value="">{tx('Seleccionar...')}</option>
          {congregaciones.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
    )}
    <div className="form-group">
      <label className="form-label">{tx('Color del polígono')}</label>
      <div className="flex items-center gap-3">
        <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="h-10 w-16 p-1 rounded-xl cursor-pointer" style={{ border: '1px solid rgba(0,0,0,0.15)' }} />
        <span className="text-sm" style={{ color: '#64748B' }}>{tx('Color visible en el mapa')}</span>
      </div>
    </div>
  </>
);

const TerritorioModales = ({ admin }) => {
  const toast = useToast();
  const {
    nuevo, setNuevo, formNuevo, setFormNuevo, guardarNuevo,
    editando, setEditando, formEdit, setFormEdit, guardarEdicion,
    asignacionesDe, setAsignacionesDe, compartir, setCompartir,
    borrar, setBorrar, eliminar, congregaciones, pedirCongregacion,
  } = admin;

  return (
    <>
      {/* Nuevo territorio (después de dibujar) */}
      {nuevo && (
        <ModalOverlay onClose={() => setNuevo(null)}>
          <h3 className="text-lg font-bold mb-5" style={{ color: '#0F172A' }}>{tx('Nuevo Territorio')}</h3>
          <form onSubmit={guardarNuevo}>
            <TerritorioForm form={formNuevo} setForm={setFormNuevo} congregaciones={congregaciones} pedirCongregacion={pedirCongregacion} />
            <div className="flex gap-3 mt-6">
              <button type="button" className="btn btn-outline flex-1" onClick={() => setNuevo(null)}>{tx('Cancelar')}</button>
              <button type="submit" className="btn btn-primary flex-1">{tx('Guardar Territorio')}</button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {/* Editar */}
      {editando && (
        <ModalOverlay onClose={() => setEditando(null)}>
          <h3 className="text-lg font-bold mb-5" style={{ color: '#0F172A' }}>{tx('Editar territorio')}</h3>
          <form onSubmit={guardarEdicion}>
            <TerritorioForm form={formEdit} setForm={setFormEdit} congregaciones={congregaciones} pedirCongregacion={false} />
            <div className="flex gap-3 mt-6">
              <button type="button" className="btn btn-outline flex-1" onClick={() => setEditando(null)}>{tx('Cancelar')}</button>
              <button type="submit" className="btn btn-primary flex-1">{tx('Guardar')}</button>
            </div>
          </form>
        </ModalOverlay>
      )}

      {asignacionesDe && <AsignacionesModal territorio={asignacionesDe} onClose={() => setAsignacionesDe(null)} />}

      {/* Compartir */}
      {compartir && (
        <ModalOverlay onClose={() => setCompartir(null)} size="small">
          <div className="flex items-center gap-2 mb-4">
            <Share2 size={18} style={{ color: '#7C3AED' }} />
            <h3 className="text-lg font-bold" style={{ color: '#0F172A' }}>{tx('Compartir Territorio')}</h3>
          </div>
          <p className="text-sm mb-4" style={{ color: '#475569' }}>{compartir.nombre}</p>
          <div className="form-group">
            <label className="form-label">{tx('Enlace de acceso')}</label>
            <div className="flex gap-2 items-center">
              <input readOnly value={compartir.link} className="flex-1 text-xs" onFocus={e => e.target.select()} />
              <button
                className="btn btn-outline shrink-0"
                onClick={() => { navigator.clipboard.writeText(compartir.link); toast.success(tx('Enlace copiado al portapapeles')); }}
              >
                <Copy size={13} /> {tx('Copiar')}
              </button>
            </div>
          </div>
          <p className="text-xs mt-2 mb-4" style={{ color: '#64748B' }}>{tx('Este enlace expira en 24 horas.')}</p>
          {compartir.id && <PuntoReunionCompartido compartidoId={compartir.id} coordenadas={compartir.coordenadas} />}
          <div className="flex gap-3">
            <button className="btn btn-outline flex-1" onClick={() => setCompartir(null)}>{tx('Cerrar')}</button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${tx('Territorio compartido:')} ${compartir.link}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary flex-1"
              style={{ textDecoration: 'none' }}
            >
              <Share2 size={14} /> WhatsApp
            </a>
          </div>
        </ModalOverlay>
      )}

      {borrar && (
        <ConfirmModal
          message={tx('¿Eliminar el territorio "{nombre}"?', { nombre: borrar.nombre })}
          detail={borrar.count > 0
            ? tx('También se eliminarán las {n} casas registradas en este territorio.', { n: borrar.count })
            : tx('Este territorio no tiene casas registradas.')}
          confirmText={tx('Sí, eliminar')}
          danger
          onConfirm={eliminar}
          onCancel={() => setBorrar(null)}
        />
      )}
    </>
  );
};

export default TerritorioModales;
