import React, { useState } from 'react';
import { useData } from '../context/DataContext';

const HousesList = () => {
  const { casas, territorios, deleteCasa, loading } = useData();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTerritory, setFilterTerritory] = useState('Todos');

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando lista de casas...</div>;
  }

  const filteredCasas = casas.filter(c => {
    const matchesSearch = c.direccion.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (c.nombre_contacto && c.nombre_contacto.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesTerritory = filterTerritory === 'Todos' || String(c.territorio_id) === String(filterTerritory);
    return matchesSearch && matchesTerritory;
  });

  const handleDelete = async (id) => {
    if (window.confirm("¿Estás seguro de eliminar esta casa?")) {
      try {
        await deleteCasa(id);
      } catch(e) {
        alert("Error al eliminar la casa. Es posible que tengas problemas de permisos.");
      }
    }
  };

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Lista de Casas</h1>
      
      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <div className="form-group" style={{ flex: 1, minWidth: '250px', margin: 0 }}>
          <input 
            placeholder="🔍 Buscar por dirección o contacto..." 
            value={searchTerm} 
            onChange={e => setSearchTerm(e.target.value)} 
          />
        </div>
        <div className="form-group" style={{ flex: 1, minWidth: '250px', margin: 0 }}>
          <select value={filterTerritory} onChange={e => setFilterTerritory(e.target.value)}>
            <option value="Todos">Todos los territorios</option>
            {territorios.map(t => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card" style={{ overflowX: 'auto', padding: 0 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>Dirección</th>
              <th style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>Territorio</th>
              <th style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>Estado</th>
              <th style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>Contacto</th>
              <th style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600 }}>Especial</th>
              <th style={{ padding: '1rem', fontSize: '0.875rem', fontWeight: 600, textAlign: 'right' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filteredCasas.length > 0 ? filteredCasas.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>{c.direccion}</td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>{c.territorio_nombre}</td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                  <span className="badge" style={{ 
                    backgroundColor: c.estado === 'Atendido' ? '#ECFDF5' : c.estado === 'No atendió' ? '#FEF2F2' : '#F3F4F6',
                    color: c.estado === 'Atendido' ? '#065F46' : c.estado === 'No atendió' ? '#991B1B' : '#1F2937'
                  }}>
                    {c.estado}
                  </span>
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>{c.nombre_contacto || '-'}</td>
                <td style={{ padding: '1rem', fontSize: '0.875rem' }}>
                  {c.tiene_caso_especial ? <span title={c.tipo_caso} style={{ color: 'var(--warning)' }}>⚠️ Sí</span> : 'No'}
                </td>
                <td style={{ padding: '1rem', fontSize: '0.875rem', textAlign: 'right' }}>
                  <button onClick={() => handleDelete(c.id)} className="btn btn-danger" style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}>
                    Eliminar
                  </button>
                </td>
              </tr>
            )) : (
              <tr>
                <td colSpan="6" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  No se encontraron casas con los filtros actuales.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HousesList;
