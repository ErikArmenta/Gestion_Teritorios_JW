import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useToast } from '../components/Toast';
import { supabase } from '../supabaseClient';
import { t } from '../i18n';

// Guarda una casa nueva: foto, nota de voz y cola offline (addCasa) incluidas.
// Lo usan las dos vistas de "Registrar casa" (clásica y 3D) para que guarden exactamente igual.
// guardarCasa() devuelve true si se guardó (en línea o en la cola offline).
const useGuardarCasa = () => {
  const { territorios, addCasa, uploadPhoto } = useData();
  const toast = useToast();
  const [isUploading, setIsUploading] = useState(false);

  const guardarCasa = async ({ formData, position, photoFile, audioBlob }) => {
    setIsUploading(true);
    try {
      const territorio = territorios.find(te => String(te.id) === String(formData.territorio_id));

      let foto_url = null;
      let photoBase64 = null;

      if (photoFile) {
        if (navigator.onLine) {
          foto_url = await uploadPhoto(photoFile);
        } else {
          // Offline: convertir a base64 para guardar en cola
          foto_url = await uploadPhoto(photoFile); // retorna data URL en modo offline
          photoBase64 = foto_url; // Guardar base64 para sync posterior
          foto_url = null; // No guardar data URL como foto_url real
        }
      }

      // Subir nota de voz si existe
      let audio_url = null;
      if (audioBlob) {
        const ext = audioBlob.type.includes('ogg') ? 'ogg' : 'webm';
        const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: audioError } = await supabase.storage
          .from('notas_voz')
          .upload(fileName, audioBlob, { contentType: audioBlob.type, upsert: false });
        if (audioError) {
          console.error('Error subiendo audio:', audioError);
          const msg = audioError.message || JSON.stringify(audioError);
          if (msg.includes('not found') || audioError.statusCode === 404) {
            toast.error(t('El bucket de notas de voz no existe. Contacta al administrador.'));
          } else if (msg.includes('row-level security') || msg.includes('policy')) {
            toast.error(t('Sin permisos para subir audio. Contacta al administrador.'));
          } else {
            toast.error(t('Error al subir nota de voz: ') + msg);
          }
          // Continuar sin audio — no bloquear el guardado de la casa
        } else {
          const { data: urlData } = supabase.storage.from('notas_voz').getPublicUrl(fileName);
          audio_url = urlData?.publicUrl || null;
        }
      }

      const casaData = {
        territorio_id:       parseInt(formData.territorio_id, 10),
        ...(formData.manzana_id ? { manzana_id: parseInt(formData.manzana_id, 10) } : {}),
        direccion:           formData.direccion,
        estado:              formData.estado,
        nombre_contacto:     formData.nombre_contacto,
        telefono:            formData.telefono,
        tiene_caso_especial: formData.tiene_caso_especial,
        tipo_caso:           formData.tipo_caso,
        detalles_caso:       formData.detalles_caso,
        notas:               formData.notas,
        territorio_nombre:   territorio?.nombre || '',
        latitud:             position.lat,
        longitud:            position.lng,
        foto_url,
        ...(audio_url ? { audio_url } : {}),
      };

      await addCasa(casaData, photoBase64);

      if (navigator.onLine) {
        toast.success(t('Casa registrada exitosamente'));
      } else {
        toast.success(t('Casa guardada offline — se sincronizará al conectarse'));
      }
      return true;
    } catch (err) {
      toast.error(t('Error al guardar: ') + (err.message || JSON.stringify(err)));
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  return { guardarCasa, isUploading };
};

export default useGuardarCasa;
