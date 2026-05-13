import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const DataContext = createContext();
export const useData = () => useContext(DataContext);

export const DataProvider = ({ children }) => {
  const [territorios, setTerritorios] = useState([]);
  const [casas, setCasas] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();

    // Realtime incremental — actualiza solo el registro afectado, no refetch completo
    const terrSub = supabase
      .channel('public:territorios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'territorios' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setTerritorios(prev => [...prev, payload.new]);
        } else if (payload.eventType === 'UPDATE') {
          setTerritorios(prev => prev.map(t => t.id === payload.new.id ? payload.new : t));
        } else if (payload.eventType === 'DELETE') {
          setTerritorios(prev => prev.filter(t => t.id !== payload.old.id));
        }
      })
      .subscribe();

    const casasSub = supabase
      .channel('public:casas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casas' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setCasas(prev => [...prev, payload.new]);
        } else if (payload.eventType === 'UPDATE') {
          setCasas(prev => prev.map(c => c.id === payload.new.id ? payload.new : c));
        } else if (payload.eventType === 'DELETE') {
          setCasas(prev => prev.filter(c => c.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(terrSub);
      supabase.removeChannel(casasSub);
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [terrRes, casasRes] = await Promise.all([
        supabase.from('territorios').select('*'),
        supabase.from('casas').select('*'),
      ]);
      if (!terrRes.error)  setTerritorios(terrRes.data  || []);
      if (!casasRes.error) setCasas(casasRes.data || []);
    } catch (err) {
      console.error('fetchData error:', err);
    } finally {
      setLoading(false);
    }
  };

  const addTerritorio = async (territorio) => {
    const { error } = await supabase.from('territorios').insert([territorio]);
    if (error) throw error;
  };

  const updateTerritorio = async (id, updates) => {
    const { error } = await supabase.from('territorios').update(updates).eq('id', id);
    if (error) throw error;
  };

  const deleteTerritorio = async (id) => {
    // Cascada manual por si no está configurada en la BD
    await supabase.from('casas').delete().eq('territorio_id', id);
    const { error } = await supabase.from('territorios').delete().eq('id', id);
    if (error) throw error;
  };

  const addCasa = async (casa) => {
    const { error } = await supabase.from('casas').insert([casa]);
    if (error) throw error;
  };

  const updateCasa = async (id, updates) => {
    const { error } = await supabase.from('casas').update(updates).eq('id', id);
    if (error) throw error;
  };

  const deleteCasa = async (id) => {
    const { error } = await supabase.from('casas').delete().eq('id', id);
    if (error) throw error;
  };

  const uploadPhoto = async (file) => {
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
    const { error } = await supabase.storage.from('fotos_casas').upload(fileName, file);
    if (error) throw error;
    const { data } = supabase.storage.from('fotos_casas').getPublicUrl(fileName);
    return data.publicUrl;
  };

  return (
    <DataContext.Provider value={{
      territorios, casas, loading,
      addTerritorio, updateTerritorio, deleteTerritorio,
      addCasa, updateCasa, deleteCasa,
      uploadPhoto,
    }}>
      {children}
    </DataContext.Provider>
  );
};
