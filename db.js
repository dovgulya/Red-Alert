/* ============================================
   Red Alert — IndexedDB Module
   ============================================ */

const DB_NAME = 'red-alert';
const DB_VERSION = 1;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('cycles')) {
        const store = db.createObjectStore('cycles', { keyPath: 'id', autoIncrement: true });
        store.createIndex('startDate', 'startDate', { unique: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

const DB = {
  async init() {
    const db = await openDB();
    // Seed defaults if not set
    const tx = db.transaction('settings', 'readonly');
    const store = tx.objectStore('settings');
    const cl = await new Promise((r) => { const req = store.get('defaultCycleLength'); req.onsuccess = () => r(req.result); });
    if (!cl) {
      await DB.setSetting('defaultCycleLength', 28);
      await DB.setSetting('defaultPeriodLength', 5);
    }
  },

  async addCycle(cycle) {
    const db = await openDB();
    const now = new Date().toISOString();
    const record = {
      ...cycle,
      createdAt: now,
      updatedAt: now
    };
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cycles', 'readwrite');
      const req = tx.objectStore('cycles').add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async updateCycle(id, data) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cycles', 'readwrite');
      const store = tx.objectStore('cycles');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const existing = getReq.result;
        if (!existing) return reject(new Error('Cycle not found'));
        const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
        const putReq = store.put(updated);
        putReq.onsuccess = () => resolve(updated);
        putReq.onerror = () => reject(putReq.error);
      };
    });
  },

  async deleteCycle(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cycles', 'readwrite');
      const req = tx.objectStore('cycles').delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async getAllCycles() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('cycles', 'readonly');
      const req = tx.objectStore('cycles').index('startDate').getAll();
      req.onsuccess = () => {
        const cycles = req.result.sort((a, b) => a.startDate.localeCompare(b.startDate));
        resolve(cycles);
      };
      req.onerror = () => reject(req.error);
    });
  },

  async getSetting(key) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.value : null);
      req.onerror = () => reject(req.error);
    });
  },

  async setSetting(key, value) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      const req = tx.objectStore('settings').put({ key, value });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async getDefaults() {
    const cycleLength = (await DB.getSetting('defaultCycleLength')) || 28;
    const periodLength = (await DB.getSetting('defaultPeriodLength')) || 5;
    return { cycleLength, periodLength };
  },

  async exportData() {
    const cycles = await DB.getAllCycles();
    const defaults = await DB.getDefaults();
    return JSON.stringify({ cycles, settings: defaults }, null, 2);
  },

  async importData(jsonStr) {
    const data = JSON.parse(jsonStr);
    if (!data.cycles || !Array.isArray(data.cycles)) {
      throw new Error('Неверный формат файла');
    }
    const db = await openDB();
    // Clear cycles
    await new Promise((resolve, reject) => {
      const tx = db.transaction('cycles', 'readwrite');
      const req = tx.objectStore('cycles').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    // Re-add cycles
    for (const cycle of data.cycles) {
      const clean = { ...cycle };
      delete clean.id; // Let autoIncrement assign new IDs
      await DB.addCycle(clean);
    }
    // Restore settings
    if (data.settings) {
      if (data.settings.cycleLength) await DB.setSetting('defaultCycleLength', data.settings.cycleLength);
      if (data.settings.periodLength) await DB.setSetting('defaultPeriodLength', data.settings.periodLength);
    }
  },

  async clearAll() {
    const db = await openDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction('cycles', 'readwrite');
      const req = tx.objectStore('cycles').clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    await DB.setSetting('defaultCycleLength', 28);
    await DB.setSetting('defaultPeriodLength', 5);
  }
};
