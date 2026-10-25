import { createContext, useContext, useEffect, useState } from 'react';
import en from './en';

// Traducción propia ES → EN.
// Los textos se escriben en español y se envuelven con t('Texto'); si el idioma es inglés
// se busca en en.js y, si falta, se muestra el español (nunca se rompe).
// Variables: t('Hace {n} días', { n: 3 }).
// Los datos capturados (nombres, direcciones, notas) NO se traducen.

const STORAGE_KEY = 'app_lang';

const leerIdioma = () => {
  try { return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'es'; } catch { return 'es'; }
};

let idiomaActual = leerIdioma();

export const getLang = () => idiomaActual;
export const getLocale = () => (idiomaActual === 'en' ? 'en-US' : 'es-MX');

export const t = (texto, vars) => {
  let out = idiomaActual === 'en' ? (en[texto] ?? texto) : texto;
  if (vars) out = out.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));
  return out;
};

const LanguageContext = createContext({ lang: 'es', setLang: () => {}, toggleLang: () => {} });

export const LanguageProvider = ({ children }) => {
  const [lang, setLangState] = useState(idiomaActual);

  useEffect(() => { document.documentElement.lang = lang; }, [lang]);

  const setLang = (l) => {
    idiomaActual = l;
    try { localStorage.setItem(STORAGE_KEY, l); } catch { /* sin storage */ }
    setLangState(l);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang: () => setLang(lang === 'es' ? 'en' : 'es') }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
