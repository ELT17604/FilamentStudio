import { fresh } from './model.js';

const storeName = 'inventory';
let database;

function emptySnapshot() {
  return { data: fresh(), revision: 0, synced: 0, tag: null };
}

export function openInventory() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('filament-studio', 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onerror = () =>
      reject(new Error('浏览器无法打开库存数据库。', { cause: request.error }));
    request.onsuccess = () => {
      database = request.result;
      resolve();
    };
  });
}

export function load(key) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName).objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result ?? emptySnapshot());
    request.onerror = () => reject(request.error);
  });
}

export function transact(key, update) {
  return new Promise((resolve, reject) => {
    // Read and write in one transaction so another tab cannot overwrite the input snapshot.
    const transaction = database.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    let next;
    let failure;

    request.onsuccess = () => {
      try {
        const current = request.result ?? emptySnapshot();
        next = update(current) ?? current;
        store.put(next, key);
      } catch (error) {
        failure = error;
        transaction.abort();
      }
    };
    transaction.oncomplete = () => resolve(next);
    transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('库存保存失败'));
  });
}
