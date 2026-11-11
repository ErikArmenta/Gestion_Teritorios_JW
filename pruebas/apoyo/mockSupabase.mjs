// Supabase falso en memoria: solo lo que usa supabase/functions/webauthn/index.ts
export const db = globalThis.__db ??= {
  app_usuarios: [], congregaciones: [], webauthn_credenciales: [], webauthn_retos: [], sinMigracion: false, seq: 1,
};

class Q {
  constructor(tabla) { this.tabla = tabla; this.op = 'select'; this.filtros = []; this.devolver = false; this.modo = 'lista'; this.head = false; }
  select(_c, opts) { if (this.op === 'select') { this.head = !!opts?.head; } else this.devolver = true; return this; }
  insert(v) { this.op = 'insert'; this.valor = v; return this; }
  update(v) { this.op = 'update'; this.valor = v; return this; }
  delete() { this.op = 'delete'; return this; }
  eq(c, v) { this.filtros.push((f) => f[c] === v); return this; }
  lt(c, v) { this.filtros.push((f) => f[c] < v); return this; }
  in(c, vs) { this.filtros.push((f) => vs.includes(f[c])); return this; }
  not(c, op, v) { if (op === 'is' && v === null) this.filtros.push((f) => f[c] != null); return this; }
  upsert(v, o) { this.op = 'upsert'; this.valor = v; this.conflicto = o?.onConflict || 'id'; return this; }
  limit() { return this; }
  order() { return this; }
  range(a, b) { this.rango = [a, b]; return this; }
  maybeSingle() { this.modo = 'quizas'; return this; }
  single() { this.modo = 'uno'; return this; }
  then(ok, mal) { return Promise.resolve().then(() => this.correr()).then(ok, mal); }
  correr() {
    if (db.sinMigracion && this.tabla.startsWith('webauthn_')) return { data: null, error: { code: '42P01', message: 'relation does not exist' } };
    if (!db[this.tabla]) return { data: null, error: { code: '42P01', message: `relation ${this.tabla} does not exist` } };
    const filas = db[this.tabla];
    const coincide = (f) => this.filtros.every((fn) => fn(f));
    let res = [];
    if (this.op === 'select') { res = filas.filter(coincide).map((f) => ({ ...f })); if (this.rango) res = res.slice(this.rango[0], this.rango[1] + 1); }
    // db.sinColumnas = { tabla: ['col'] } → como la BD real cuando falta una columna
    const faltan = (db.sinColumnas?.[this.tabla] || []).filter((c) => (Array.isArray(this.valor) ? this.valor : [this.valor]).some((v) => v && c in v));
    if (faltan.length && ['insert', 'upsert', 'update'].includes(this.op)) {
      return { data: null, error: { code: 'PGRST204', message: `Could not find the '${faltan[0]}' column of '${this.tabla}' in the schema cache` } };
    }
    if (this.op === 'insert') {
      const nuevas = (Array.isArray(this.valor) ? this.valor : [this.valor]).map((v) => ({
        id: this.tabla === 'webauthn_retos' ? crypto.randomUUID() : db.seq++, ...v,
      }));
      if (this.tabla === 'webauthn_credenciales' && nuevas.some((n) => filas.some((f) => f.credencial_id === n.credencial_id))) {
        return { data: null, error: { code: '23505', message: 'duplicate' } };
      }
      filas.push(...nuevas); res = nuevas;
    }
    if (this.op === 'upsert') {
      res = (Array.isArray(this.valor) ? this.valor : [this.valor]).map((v) => {
        const k = this.conflicto;
        const ex = filas.find((f) => f[k] === v[k]);
        if (ex) { Object.assign(ex, v); return ex; }
        filas.push({ ...v }); return v;
      });
    }
    if (this.op === 'update') { res = filas.filter(coincide); res.forEach((f) => Object.assign(f, this.valor)); }
    if (this.op === 'delete') { res = filas.filter(coincide); db[this.tabla] = filas.filter((f) => !coincide(f)); }
    if (this.head) return { data: null, error: null, count: res.length };
    if (this.modo === 'uno') return res.length === 1 ? { data: res[0], error: null } : { data: null, error: { code: 'PGRST116' } };
    if (this.modo === 'quizas') return { data: res[0] ?? null, error: null };
    return { data: res, error: null };
  }
}

// rpc('verificar_password'): hash falso 'h:' + contraseña (el SQL real se prueba aparte con PGlite)
const rpc = (nombre, a) => Promise.resolve().then(() => {
  if (nombre !== 'verificar_password' || db.sinMigracion11) return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.verificar_password' } };
  if (!a.p_password) return { data: null, error: null };
  const f = db.app_usuarios.find((u) => (a.p_id != null ? u.id === a.p_id : u.usuario === a.p_usuario)
    && (u.password_hash ? u.password_hash === 'h:' + a.p_password : u.password === a.p_password));
  return { data: f ? f.id : null, error: null };
});
// Storage en memoria: db.storage = { bucket: { nombre: { bytes, created_at } } }
const storage = {
  from: (bucket) => {
    const b = () => ((db.storage ??= {})[bucket] ??= {});
    return {
      upload: async (nombre, datos) => { b()[nombre] = { bytes: datos.byteLength ?? datos.length ?? 0, datos, created_at: new Date().toISOString() }; return { data: { path: nombre }, error: null }; },
      list: async (_p, o) => {
        let l = Object.entries(b()).map(([name, v]) => ({ name, created_at: v.created_at, metadata: { size: v.bytes } }));
        l.sort((x, y) => (o?.sortBy?.order === 'desc' ? y.name.localeCompare(x.name) : x.name.localeCompare(y.name)));
        return { data: l.slice(0, o?.limit ?? 100), error: null };
      },
      remove: async (nombres) => { nombres.forEach((n) => delete b()[n]); return { data: nombres, error: null }; },
      createSignedUrl: async (nombre, seg) => (b()[nombre] ? { data: { signedUrl: `https://firmado.local/${bucket}/${nombre}?t=${seg}` }, error: null } : { data: null, error: { message: 'Object not found' } }),
    };
  },
};
export const createClient = () => ({ from: (t) => new Q(t), rpc, storage });
