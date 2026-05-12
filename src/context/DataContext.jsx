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

    // Real-time subscriptions para mantener todo sincronizado entre clientes
    const territoriosSubscription = supabase
      .channel('public:territorios')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'territorios' }, payload => {
        fetchData(); 
      })
      .subscribe();

    const casasSubscription = supabase
      .channel('public:casas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'casas' }, payload => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(territoriosSubscription);
      supabase.removeChannel(casasSubscription);
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: terrData, error: terrErr } = await supabase.from('territorios').select('*');
      if (terrErr) console.error("Error fetching territorios:", terrErr);
      else setTerritorios(terrData || []);

      const { data: casasData, error: casasErr } = await supabase.from('casas').select('*');
      if (casasErr) console.error("Error fetching casas:", casasErr);
      else setCasas(casasData || []);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const addTerritorio = async (territorio) => {
    // Si supabase lanza error (ej. tabla no existe aún), lo atrapamos en el UI
    const { error } = await supabase.from('territorios').insert([territorio]);
    if (error) throw error;
  };

  const addCasa = async (casa) => {
    const { error } = await supabase.from('casas').insert([casa]);
    if (error) throw error;
  };

  const deleteTerritorio = async (id) => {
    // Cascada manual por si no está configurada en la BD
    await supabase.from('casas').delete().eq('territorio_id', id);
    const { error } = await supabase.from('territorios').delete().eq('id', id);
    if (error) throw error;
  };

  const deleteCasa = async (id) => {
    const { error } = await supabase.from('casas').delete().eq('id', id);
    if (error) throw error;
  };

  const updateCasa = async (id, updates) => {
    const { error } = await supabase.from('casas').update(updates).eq('id', id);
    if (error) throw error;
  };

  const uploadPhoto = async (file) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    
    const { error, data } = await supabase.storage
      .from('fotos_casas')
      .upload(fileName, file);

    if (error) throw error;
    
    const { data: publicUrlData } = supabase.storage
      .from('fotos_casas')
      .getPublicUrl(fileName);

    return publicUrlData.publicUrl;
  };

  return (
    <DataContext.Provider value={{
      territorios, casas, loading,
      addTerritorio, addCasa, deleteTerritorio, deleteCasa, updateCasa, uploadPhoto
    }}>
      {children}
    </DataContext.Provider>
  );
};
