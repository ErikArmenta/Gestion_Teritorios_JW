/**
 * offlineStore.js — Wrapper liviano sobre IndexedDB para persistencia offline.
 * No usa dependencias externas.
 *
 * NOTA: Si las alertas no se muestran, verificar en Supabase Dashboard:
 * 1. Tabla alertas_panico → Authentication → RLS debe estar OFF
 *    (o tener policy: CREATE POLICY "anon_all" ON alertas_panico FOR ALL USING (true) WITH CHECK (true))
 * 2. La relación con app_usuarios debe existir (FK usuario_id → app_usuarios.id)
 * 3. Verificar en consola del navegador los logs [PanicHistory]
 */

const DB_NAME = 'territorial_offline';
const DB_VERSION = 1;

const STORES = {
  territorios: 'territorios',
  casas: 'casas',
  pendingQueue: 'pendingQueue', // Cola de operaciones pendientes
};

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORES.territorios)) {
        db.createObjectStore(STORES.territorios, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.casas)) {
        db.createObjectStore(STORES.casas, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.pendingQueue)) {
        db.createObjectStore(STORES.pendingQueue, { keyPath: 'queueId', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllFromStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putAllToStore(storeName, items) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.clear(); // Replace all
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function putOneToStore(storeName, item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteFromStore(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Public API ──

export const offlineStore = {
  // Cache de datos para lectura offline
  cacheTerritorios: (items) => putAllToStore(STORES.territorios, items),
  cacheCasas: (items) => putAllToStore(STORES.casas, items),
  getCachedTerritorios: () => getAllFromStore(STORES.territorios),
  getCachedCasas: () => getAllFromStore(STORES.casas),

  // Cola de operaciones pendientes
  addToPendingQueue: async (operation) => {
    // operation = { type: 'addCasa', data: {...}, timestamp: Date.now() }
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.pendingQueue, 'readwrite');
      const store = tx.objectStore(STORES.pendingQueue);
      store.add(operation);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  getPendingQueue: () => getAllFromStore(STORES.pendingQueue),
  removeFromPendingQueue: (queueId) => deleteFromStore(STORES.pendingQueue, queueId),
  clearPendingQueue: async () => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.pendingQueue, 'readwrite');
      tx.objectStore(STORES.pendingQueue).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
};
