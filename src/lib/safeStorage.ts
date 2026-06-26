// Safe storage wrapper for high reliability in restricted iframe environments
const memoryStorage: Record<string, string> = {};

export const safeStorage = {
  getItem(key: string): string | null {
    try {
      // Check if localStorage exists and is accessible
      if (typeof window !== 'undefined' && window.localStorage) {
        return localStorage.getItem(key);
      }
    } catch (e) {
      console.warn(`localStorage.getItem denied/blocked for key "${key}", using in-memory helper`, e);
    }
    return memoryStorage[key] !== undefined ? memoryStorage[key] : null;
  },

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(key, value);
        return;
      }
    } catch (e) {
      console.warn(`localStorage.setItem denied/blocked for key "${key}", using in-memory helper`, e);
    }
    memoryStorage[key] = String(value);
  },

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(key);
        return;
      }
    } catch (e) {
      console.warn(`localStorage.removeItem denied/blocked for key "${key}", using in-memory helper`, e);
    }
    delete memoryStorage[key];
  }
};
