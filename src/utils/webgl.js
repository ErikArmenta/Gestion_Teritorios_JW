// ¿El navegador puede dibujar mapas 3D? MapLibre 6 necesita WebGL2.
// Se prueba una sola vez y se libera el contexto de prueba (los navegadores limitan cuántos hay).
let cache = null;

export const soportaWebGL2 = () => {
  if (cache !== null) return cache;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    cache = !!gl;
  } catch {
    cache = false;
  }
  return cache;
};
