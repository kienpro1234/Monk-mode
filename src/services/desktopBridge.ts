import { MonkDatabaseSchema } from '../types/models';
import { createInitialDatabase } from './defaultData';

export interface RunningOSApp {
  Id: number;
  ProcessName: string;
  MainWindowTitle: string;
}

export interface ScreenSourceItem {
  id: string;
  name: string;
  dataUrl: string;
}

interface ElectronMonkAPI {
  isElectron: boolean;
  loadDB: () => Promise<MonkDatabaseSchema | null>;
  saveDB: (data: MonkDatabaseSchema) => Promise<{ ok: boolean; path?: string }>;
  setMonkLock: (payload: {
    isMonkModeOn: boolean;
    whitelistedApps: string[];
    processGuardEnabled: boolean;
  }) => Promise<{ ok: boolean }>;
  setAlarmHijack: (active: boolean) => Promise<{ ok: boolean }>;
  setWallpaperDataUrl: (dataUrl: string) => Promise<{ ok: boolean; path?: string }>;
  restoreWallpaper: () => Promise<{ ok: boolean; restoredPath?: string; reason?: string }>;
  listRunningApps: () => Promise<RunningOSApp[]>;
  getScreenSources: () => Promise<ScreenSourceItem[]>;
  notify: (payload: { title: string; body: string }) => Promise<{ ok: boolean }>;
  exportScrollPdf: (payload: {
    htmlContent: string;
    defaultFileName: string;
  }) => Promise<{ ok: boolean; filePath?: string; canceled?: boolean }>;
  forceQuitDev: () => Promise<void>;
  onWindowFocusChanged: (cb: (data: { isFocused: boolean; timestamp: number }) => void) => () => void;
  onCloseBlocked: (cb: (data: { message: string }) => void) => () => void;
  onProcessBlocked: (cb: (data: { processName: string; title: string; timestamp: number }) => void) => () => void;
  onDevEmergencyUnlock: (cb: (data: { timestamp: number }) => void) => () => void;
}

declare global {
  interface Window {
    monkDesktopAPI?: ElectronMonkAPI;
  }
}

const LOCAL_STORAGE_KEY = 'LEN_NUI_DESKTOP_DB_V20_UNIFIED';

export const desktopBridge = {
  isElectron(): boolean {
    return Boolean(window.monkDesktopAPI?.isElectron);
  },

  async loadDatabase(): Promise<MonkDatabaseSchema> {
    if (window.monkDesktopAPI) {
      const db = await window.monkDesktopAPI.loadDB();
      if (db && db.session) {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
        return db;
      }
    } else {
      try {
        const res = await fetch('/api/db');
        if (res.ok) {
          const json = await res.json();
          if (json?.data?.session) {
            localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(json.data));
            return json.data;
          }
        }
      } catch {
        // Fallback to localStorage
      }
    }

    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.session) return parsed;
      } catch {
        // Ignore
      }
    }

    const initial = createInitialDatabase();
    await this.saveDatabase(initial);
    return initial;
  },

  async saveDatabase(db: MonkDatabaseSchema): Promise<void> {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(db));
    if (window.monkDesktopAPI) {
      await window.monkDesktopAPI.saveDB(db);
      return;
    }
    try {
      await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: db }),
      });
    } catch {
      // Saved in localStorage already
    }
  },

  async syncMonkLockState(params: {
    isMonkModeOn: boolean;
    whitelistedApps: string[];
    processGuardEnabled: boolean;
  }) {
    if (window.monkDesktopAPI) {
      return await window.monkDesktopAPI.setMonkLock(params);
    }
    try {
      await fetch('/api/os/monk-lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
    } catch {
      // Ignore
    }
    return { ok: true };
  },

  async setAlarmHijack(active: boolean) {
    if (window.monkDesktopAPI) {
      return await window.monkDesktopAPI.setAlarmHijack(active);
    }
    try {
      await fetch('/api/os/alarm-hijack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
    } catch {
      // Ignore
    }
    if (active && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (!active && document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    return { ok: true };
  },

  async setWindowsWallpaper(dataUrl: string): Promise<{ ok: boolean; path?: string }> {
    if (window.monkDesktopAPI) {
      return await window.monkDesktopAPI.setWallpaperDataUrl(dataUrl);
    }
    try {
      const res = await fetch('/api/os/set-wallpaper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      if (res.ok) return await res.json();
    } catch {
      // Ignore
    }
    return { ok: false };
  },

  async restoreWindowsWallpaper(): Promise<{ ok: boolean; restoredPath?: string; reason?: string }> {
    if (window.monkDesktopAPI) {
      return await window.monkDesktopAPI.restoreWallpaper();
    }
    try {
      const res = await fetch('/api/os/restore-wallpaper', { method: 'POST' });
      if (res.ok) return await res.json();
    } catch {
      // Ignore
    }
    return { ok: false };
  },

  async listRunningApps(): Promise<RunningOSApp[]> {
    if (window.monkDesktopAPI) {
      return await window.monkDesktopAPI.listRunningApps();
    }
    try {
      const res = await fetch('/api/os/running-apps');
      if (res.ok) {
        const data = await res.json();
        return data.apps || [];
      }
    } catch {
      // Ignore
    }
    return [];
  },

  async getScreenCaptureSources(): Promise<ScreenSourceItem[]> {
    if (window.monkDesktopAPI) {
      const sources = await window.monkDesktopAPI.getScreenSources();
      if (sources && sources.length > 0) return sources;
    }
    try {
      const res = await fetch('/api/os/capture-screen');
      if (res.ok) {
        const data = await res.json();
        if (data.sources && data.sources.length > 0) return data.sources;
      }
    } catch {
      // Ignore
    }
    return [];
  },

  async sendNotification(title: string, body: string) {
    if (window.monkDesktopAPI) {
      await window.monkDesktopAPI.notify({ title, body });
      return;
    }
    if ('Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(title, { body });
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then((p) => {
          if (p === 'granted') new Notification(title, { body });
        });
      }
    }
  },

  async exportScrollToPdf(htmlContent: string, defaultFileName: string) {
    if (window.monkDesktopAPI) {
      return await window.monkDesktopAPI.exportScrollPdf({ htmlContent, defaultFileName });
    }
    const printWin = window.open('', '_blank', 'width=900,height=1100');
    if (printWin) {
      printWin.document.write(htmlContent);
      printWin.document.close();
      setTimeout(() => {
        printWin.focus();
        printWin.print();
      }, 500);
      return { ok: true, filePath: 'Cửa sổ xuất/in PDF Cổ Thư' };
    }
    return { ok: false };
  },
};
