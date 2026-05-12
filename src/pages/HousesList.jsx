import React, { useState } from 'react';
import { useData } from '../context/DataContext';

const statusClass = (estado) => {
  if (estado === 'Atendido') return 'badge bg-emerald-50 text-emerald-800';
  if (estado === 'No atendió') return 'badge bg-red-50 text-red-800';
  return 'badge bg-gray-100 text-gray-800';
};

const HousesList = () => {
  const { casas, territorios, deleteCasa, loading } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTerritory, setFilterTerritory] = useState('Todos');

  if (loading) {
    return <div className="p-8 text-center">Cargando lista de casas...</div>;
  }

  const filteredCasas = casas.filter(c => {
    const matchesSearch = c.direccion.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (c.nombre_contacto && c.nombre_contacto.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesTerritory = filterTerritory === 'Todos' || String(c.territorio_id) === String(filterTerritory);
    return matchesSearch && matchesTerritory;
  });

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar esta casa?')) {
      try {
        await deleteCasa(id);
      } catch (e) {
        alert('Error al eliminar la casa. Es posible que tengas problemas de permisos.');
      }
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Lista de Casas</h1>

      {/* Filtros */}
      <div className="card mb-6 flex flex-col sm:flex-row gap-4">
        <div className="form-group flex-1 min-w-0 m-0">
          <input
            placeholder="Buscar por dirección o contacto..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="form-group flex-1 min-w-0 m-0">
          <select value={filterTerritory} onChange={e => setFilterTerritory(e.target.value)}>
            <option value="Todos">Todos los territorios</option>
            {territorios.map(t => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla — solo desktop */}
      <div className="hidden md:block">
        <div className="card overflow-x-auto p-0">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-[var(--bg-primary)] border-b border-[var(--border-color)]">
                <th className="px-4 py-3 text-sm font-semibold">Dirección</th>
                <th className="px-4 py-3 text-sm font-semibold">Territorio</th>
                <th className="px-4 py-3 text-sm font-semibold">Estado</th>
                <th className="px-4 py-3 text-sm font-semibold">Contacto</th>
                <th className="px-4 py-3 text-sm font-semibold">Especial</th>
                <th className="px-4 py-3 text-sm font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredCasas.length > 0 ? filteredCasas.map(c => (
                <tr key={c.id} className="border-b border-[var(--border-color)]">
                  <td className="px-4 py-3 text-sm">{c.direccion}</td>
                  <td className="px-4 py-3 text-sm">{c.territorio_nombre}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={statusClass(c.estado)}>{c.estado}</span>
                  </td>
                  <td className="px-4 py-3 text-sm">{c.nombre_contacto || '-'}</td>
                  <td className="px-4 py-3 text-sm">
                    {c.tiene_caso_especial
                      ? <span title={c.tipo_caso} className="text-[var(--warning)]">⚠️ Sí</span>
                      : 'No'}
                  </td>
                  <td className="px-4 py-3 text-sm text-right">
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="btn btn-danger py-1.5 px-3 text-xs"
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-[var(--text-secondary)] text-sm">
                    No se encontraron casas con los filtros actuales.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Cards — solo móvil */}
      <div className="md:hidden space-y-3">
        {filteredCasas.length > 0 ? filteredCasas.map(c => (
          <div key={c.id} className="card p-4">
            {/* Fila superior: dirección + badge estado */}
            <div className="flex justify-between items-start gap-2 mb-2">
              <span className="font-semibold text-sm">{c.direccion}</span>
              <span className={statusClass(c.estado)}>{c.estado}</span>
            </div>
            {/* Fila media: territorio y contacto */}
            <div className="text-sm text-gray-500 mb-3 space-y-0.5">
              <div>Territorio: {c.territorio_nombre || '-'}</div>
              <div>Contacto: {c.nombre_contacto || '-'}</div>
              {c.tiene_caso_especial && (
                <div className="text-[var(--warning)]">⚠️ Caso especial</div>
              )}
            </div>
            {/* Fila inferior: botón Eliminar */}
            <div className="flex justify-end">
              <button
                onClick={() => handleDelete(c.id)}
                className="btn btn-danger py-1.5 px-3 text-xs"
              >
                Eliminar
              </button>
            </div>
          </div>
        )) : (
          <div className="card p-8 text-center text-[var(--text-secondary)] text-sm">
            No se encontraron casas con los filtros actuales.
          </div>
        )}
      </div>
    </div>
  );
};

export default HousesList;
