// Lectura de app_usuarios con columnas explícitas.
// Con el blindaje (Migración 12) la BD NO deja leer `password` ni `password_hash`: un select('*') en
// app_usuarios falla. Usa estas columnas (o `seleccionarUsuarios`) en toda consulta nueva.
export const COLUMNAS_USUARIO_BASE = 'id, nombre, usuario, rol, activo, foto_url, congregacion_id, created_at';
const EXTRA = 'grupo_id, tipo_publicador, meta_horas_mensual, meta_horas_anual'; // Migraciones 5 y 7

// ¿El error es por una columna que no existe o que no se puede leer? → probar con menos columnas
const esErrorDeColumna = (e) => ['42703', '42501', 'PGRST204'].includes(e?.code)
  || /column|permission denied/i.test(e?.message || '');

// armar(columnas) → consulta de supabase (promesa). Prueba de más a menos columnas.
// conPassword: además intenta leer la contraseña (solo mientras la BD lo permita: antes del blindaje).
export async function seleccionarUsuarios(armar, { conPassword = false } = {}) {
  const intentos = [
    ...(conPassword ? [`${COLUMNAS_USUARIO_BASE}, ${EXTRA}, password, password_hash`, `${COLUMNAS_USUARIO_BASE}, ${EXTRA}, password`] : []),
    `${COLUMNAS_USUARIO_BASE}, ${EXTRA}`,
    `${COLUMNAS_USUARIO_BASE}, grupo_id`,
    COLUMNAS_USUARIO_BASE,
  ];
  let res;
  for (const columnas of intentos) {
    res = await armar(columnas);
    if (!res.error || !esErrorDeColumna(res.error)) return res;
  }
  return res;
}
