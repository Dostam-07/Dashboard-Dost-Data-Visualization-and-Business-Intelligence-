import { get as _get, set as _set, del as _del, keys as _keys } from 'idb-keyval';
import { safeStorage } from './safeStorage';

const memoryDB: Record<string, any> = {};

// We can store structured data in safeStorage by JSON.serializing it
export const safeIdb = {
  async get<T = any>(key: string): Promise<T | undefined> {
    try {
      return await _get(key);
    } catch (e) {
      console.warn(`IndexedDB.get failed for key "${key}". Falling back to safeStorage/memory.`, e);
      if (memoryDB[key] !== undefined) {
        return memoryDB[key] as T;
      }
      const stored = safeStorage.getItem(`db_fb_${key}`);
      if (stored !== null) {
        try {
          return JSON.parse(stored) as T;
        } catch {
          return stored as any as T;
        }
      }
      return undefined;
    }
  },

  async set(key: string, value: any): Promise<void> {
    try {
      await _set(key, value);
    } catch (e) {
      console.warn(`IndexedDB.set failed for key "${key}". Falling back to safeStorage/memory.`, e);
      memoryDB[key] = value;
      try {
        safeStorage.setItem(`db_fb_${key}`, typeof value === 'string' ? value : JSON.stringify(value));
      } catch (_) {}
    }
  },

  async del(key: string): Promise<void> {
    try {
      await _del(key);
    } catch (e) {
      console.warn(`IndexedDB.del failed for key "${key}". Falling back to safeStorage/memory.`, e);
      delete memoryDB[key];
      try {
        safeStorage.removeItem(`db_fb_${key}`);
      } catch (_) {}
    }
  },

  async keys(): Promise<string[]> {
    try {
      const dbKeys = await _keys();
      return dbKeys.map(k => String(k));
    } catch (e) {
      console.warn("IndexedDB.keys failed. Falling back to local storage and memory keys.", e);
      const fallbackKeys = new Set<string>();
      // Gather keys from memoryDB
      Object.keys(memoryDB).forEach(k => fallbackKeys.add(k));
      // Gather keys from localStorage/safeStorage with prefix
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('db_fb_')) {
              fallbackKeys.add(k.substring(6));
            }
          }
        }
      } catch (_) {}
      return Array.from(fallbackKeys);
    }
  }
};
