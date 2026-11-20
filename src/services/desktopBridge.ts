import { MonkDatabaseSchema } from '../types/models';
import { createDefaultOptimizationNotes, createInitialDatabase } from './defaultData';

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

export interface SuggestedReturnHomeInfo {
  shiftDateStr: string;
  shiftMode: 'DAY' | 'NIGHT';
  workStartTime: string;
  detectedHHMM: string;
  detectedAtMs: number;
  estimatedWorkMins: number;
}

export interface DaemonStatusInfo {
  ok: boolean;
  pid?: number;
  port?: number;
  startedAt?: number;
  uptimeSec?: number;
  trayRunning?: boolean;
  lastHeartbeatAt?: number;
  lastEvaluationAt?: number;
  pendingCutoffMs?: number;
  pendingMinutesLeft?: number;
  pendingViolationsCount?: number;
  dbUpdatedAt?: number;
  workShiftConfirmed?: boolean;
  suggestedReturnHome?: SuggestedReturnHomeInfo | null;
  pendingTrayAction?: { id: number; type: 'TOGGLE_POMO' } | null;
  recentBlockedProcesses?: Array<{ processName: string; title: string; timestamp: number }>;
  processGuardActive?: boolean;
}

export interface AutoStartStatusInfo {
  ok: boolean;
  enabled: boolean;
  command?: string;
  scriptPath?: string;
  reason?: string;
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

const LOCAL_STORAGE_KEY = 'LEN_NUI_DESKTOP_DB_V31_CLEAN_START';
const LEGACY_KEYS = ['LEN_NUI_DESKTOP_DB_V20_UNIFIED', 'LEN_NUI_DESKTOP_DB_V30_MULTI_MOUNTAIN'];
const DAEMON_ORIGIN = 'http://127.0.0.1:5173';

function apiUrl(endpoint: string): string {
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return `${DAEMON_ORIGIN}${endpoint}`;
  }
  return endpoint;
}

/**
 * Chuẩn hóa URI ảnh Proof-of-Work thành URL hiển thị hợp lệ:
 * - Giữ nguyên URL data:, http(s):, blob:, file: (tương thích ngược với DB cũ).
 * - Tên file thuần (vd: "pow-1763...-a1b2.jpg") hoặc "/api/proofs/..." -> "/api/proofs/<filename>"
 *   (tự động thêm http://127.0.0.1:5173 khi chạy qua file:// hoặc khi in PDF Popup / forceAbsoluteOrigin=true).
 */
export function resolveProofImageUrl(
  uri?: string | null,
  forceAbsoluteOrigin: boolean = false
): string {
  if (!uri) return '';
  const trimmed = String(uri).trim();
  if (!trimmed) return '';
  if (/^(data:|https?:|blob:|file:)/i.test(trimmed)) {
    return trimmed;
  }
  const cleanName = trimmed
    .replace(/^\/?api\/proofs\//i, '')
    .replace(/^\/+/, '');
  if (!cleanName) return '';
  const endpoint = `/api/proofs/${encodeURIComponent(cleanName)}`;
  if (
    forceAbsoluteOrigin ||
    (typeof window !== 'undefined' && window.location.protocol === 'file:')
  ) {
    return `${DAEMON_ORIGIN}${endpoint}`;
  }
  return endpoint;
}

function safeSetLocalStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Bỏ qua QuotaExceededError khi có nhiều ảnh Proof-of-Work (dữ liệu gốc vẫn được lưu an toàn qua /api/db trên ổ cứng)
  }
}

function isLegacyTestDatabase(raw: MonkDatabaseSchema | null): boolean {
  if (!raw || !raw.session) return true;
  if (
    raw.session.id === 'session-current-01' ||
    raw.session.id === 'session-current-v3'
  ) {
    return true;
  }
  return false;
}

function migrateSleepSlotsInPlan(plan: MonkDatabaseSchema['climbingSchedulePlan']) {
  if (!plan || !Array.isArray(plan.days)) return plan ?? null;
  return {
    ...plan,
    days: plan.days.map((d) => ({
      ...d,
      slots: Array.isArray(d.slots)
        ? d.slots.map((sl) =>
            sl.kind === 'REST_ROUTINE' && /ngủ|sleep/i.test(sl.title || '')
              ? { ...sl, kind: 'SLEEP' as const }
              : sl
          )
        : [],
    })),
  };
}

function upgradeOrNormalizeDb(raw: MonkDatabaseSchema | null): MonkDatabaseSchema | null {
  if (!raw || !raw.session) return null;
  if (isLegacyTestDatabase(raw)) {
    return null; // Force clean initialization without test data
  }
  return {
    ...raw,
    session: {
      ...raw.session,
      isMonkModeOn: false,
    },
    ritualGroups: Array.isArray(raw.ritualGroups) ? raw.ritualGroups : [],
    peakGoals: Array.isArray(raw.peakGoals) ? raw.peakGoals : [],
    dailyStrikes: Array.isArray(raw.dailyStrikes) ? raw.dailyStrikes : [],
    reflectionJournals: Array.isArray(raw.reflectionJournals) ? raw.reflectionJournals : [],
    sacredScrolls: Array.isArray(raw.sacredScrolls) ? raw.sacredScrolls : [],
    violations: Array.isArray(raw.violations) ? raw.violations : [],
    optimizationNotes: Array.isArray(raw.optimizationNotes)
      ? raw.optimizationNotes
      : createDefaultOptimizationNotes(),
    climbingSchedulePlan: migrateSleepSlotsInPlan(raw.climbingSchedulePlan ?? null),
    focusSessionLogs: Array.isArray(raw.focusSessionLogs) ? raw.focusSessionLogs : [],
    savedScheduleProfiles: Array.isArray(raw.savedScheduleProfiles)
      ? raw.savedScheduleProfiles.map((p) => ({
          ...p,
          plan: migrateSleepSlotsInPlan(p.plan)!,
        }))
      : [],
    dailyWorkShiftLogs:
      raw.dailyWorkShiftLogs && typeof raw.dailyWorkShiftLogs === 'object'
        ? raw.dailyWorkShiftLogs
        : {},
  };
}

let pendingSaveTimer: number | null = null;
let pendingSavePayload: MonkDatabaseSchema | null = null;
let pendingSaveAllowEmpty = false;

async function commitSaveToHost(
  stampedDb: MonkDatabaseSchema,
  allowEmptyOverwrite: boolean
): Promise<void> {
  safeSetLocalStorage(LOCAL_STORAGE_KEY, JSON.stringify(stampedDb));
  if (window.monkDesktopAPI) {
    await window.monkDesktopAPI.saveDB(stampedDb);
    return;
  }
  try {
    await fetch(apiUrl('/api/db'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: stampedDb, allowEmptyOverwrite }),
    });
  } catch {
    // Saved in localStorage already
  }
}

export function flushPendingDatabaseSave(useBeacon: boolean = false): void {
  if (pendingSaveTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }
  const payload = pendingSavePayload;
  const allowEmpty = pendingSaveAllowEmpty;
  if (!payload) return;
  pendingSavePayload = null;
  pendingSaveAllowEmpty = false;

  safeSetLocalStorage(LOCAL_STORAGE_KEY, JSON.stringify(payload));
  if (window.monkDesktopAPI) {
    void window.monkDesktopAPI.saveDB(payload);
    return;
  }
  if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([JSON.stringify({ data: payload, allowEmptyOverwrite: allowEmpty })], {
      type: 'application/json',
    });
    navigator.sendBeacon(apiUrl('/api/db'), blob);
    return;
  }
  void commitSaveToHost(payload, allowEmpty);
}

if (typeof window !== 'undefined') {
  const flushOnExit = () => flushPendingDatabaseSave(true);
  window.addEventListener('beforeunload', flushOnExit);
  window.addEventListener('pagehide', flushOnExit);
}

export const desktopBridge = {
  isElectron(): boolean {
    return Boolean(window.monkDesktopAPI?.isElectron);
  },

  async resetDatabase(includeDefaultRitualFrames: boolean = true): Promise<MonkDatabaseSchema> {
    for (const k of LEGACY_KEYS) {
      localStorage.removeItem(k);
    }
    localStorage.removeItem(LOCAL_STORAGE_KEY);
    const cleanDb = createInitialDatabase(includeDefaultRitualFrames);
    await this.saveDatabase(cleanDb, true);
    return cleanDb;
  },

  async loadDatabase(): Promise<MonkDatabaseSchema> {
    for (const k of LEGACY_KEYS) {
      localStorage.removeItem(k);
    }

    if (window.monkDesktopAPI) {
      const loaded = await window.monkDesktopAPI.loadDB();
      const db = upgradeOrNormalizeDb(loaded);
      if (db && db.session) {
        safeSetLocalStorage(LOCAL_STORAGE_KEY, JSON.stringify(db));
        return db;
      }
    } else {
      try {
        const res = await fetch(apiUrl('/api/db'));
        if (res.ok) {
          const json = await res.json();
          const upgraded = upgradeOrNormalizeDb(json?.data || null);
          if (upgraded && upgraded.session) {
            safeSetLocalStorage(LOCAL_STORAGE_KEY, JSON.stringify(upgraded));
            return upgraded;
          }
        }
      } catch {
        // Fallback to localStorage
      }
    }

    const cached = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (cached) {
      try {
        const parsed = upgradeOrNormalizeDb(JSON.parse(cached));
        if (parsed && parsed.session) {
          await this.saveDatabase(parsed);
          return parsed;
        }
      } catch {
        // Ignore
      }
    }

    const initial = createInitialDatabase(true);
    await this.saveDatabase(initial);
    return initial;
  },

  async fetchServerDatabase(): Promise<MonkDatabaseSchema | null> {
    if (window.monkDesktopAPI) {
      const loaded = await window.monkDesktopAPI.loadDB();
      const db = upgradeOrNormalizeDb(loaded);
      if (db && db.session) {
        safeSetLocalStorage(LOCAL_STORAGE_KEY, JSON.stringify(db));
        return db;
      }
      return null;
    }
    try {
      const res = await fetch(apiUrl('/api/db'));
      if (res.ok) {
        const json = await res.json();
        const upgraded = upgradeOrNormalizeDb(json?.data || null);
        if (upgraded && upgraded.session) {
          safeSetLocalStorage(LOCAL_STORAGE_KEY, JSON.stringify(upgraded));
          return upgraded;
        }
      }
    } catch {
      // Ignore
    }
    return null;
  },

  async saveDatabase(db: MonkDatabaseSchema, allowEmptyOverwrite: boolean = false): Promise<void> {
    const now = Date.now();
    const stampedDb: MonkDatabaseSchema = {
      ...db,
      session: {
        ...db.session,
        lastActiveAt: now,
        maxObservedAt: Math.max(now, db.session.maxObservedAt || 0, db.session.lastActiveAt || 0),
      },
    };
    if (allowEmptyOverwrite || typeof window === 'undefined') {
      if (pendingSaveTimer !== null && typeof window !== 'undefined') {
        window.clearTimeout(pendingSaveTimer);
        pendingSaveTimer = null;
      }
      pendingSavePayload = null;
      pendingSaveAllowEmpty = false;
      await commitSaveToHost(stampedDb, allowEmptyOverwrite);
      return;
    }

    pendingSavePayload = stampedDb;
    pendingSaveAllowEmpty = pendingSaveAllowEmpty || allowEmptyOverwrite;
    if (pendingSaveTimer !== null) {
      window.clearTimeout(pendingSaveTimer);
    }
    pendingSaveTimer = window.setTimeout(() => {
      pendingSaveTimer = null;
      const toSave = pendingSavePayload;
      const allowEmpty = pendingSaveAllowEmpty;
      pendingSavePayload = null;
      pendingSaveAllowEmpty = false;
      if (toSave) {
        void commitSaveToHost(toSave, allowEmpty);
      }
    }, 400);
  },

  flushPendingSave(): void {
    flushPendingDatabaseSave(false);
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
      await fetch(apiUrl('/api/os/monk-lock'), {
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
      await fetch(apiUrl('/api/os/alarm-hijack'), {
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
      const res = await fetch(apiUrl('/api/os/set-wallpaper'), {
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
      const res = await fetch(apiUrl('/api/os/restore-wallpaper'), { method: 'POST' });
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
      const res = await fetch(apiUrl('/api/os/running-apps'));
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
      const res = await fetch(apiUrl('/api/os/capture-screen'));
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
    try {
      await fetch(apiUrl('/api/os/notify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, body }),
      });
    } catch {
      // Ignore
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

  async getDaemonStatus(): Promise<DaemonStatusInfo> {
    try {
      const res = await fetch(apiUrl('/api/daemon/status'));
      if (res.ok) return await res.json();
    } catch {
      // Ignore
    }
    return { ok: false };
  },

  async pingHeartbeat(): Promise<{
    ok: boolean;
    evaluated?: boolean;
    lastActiveAt?: number;
    dbUpdatedAt?: number;
    suggestedReturnHome?: SuggestedReturnHomeInfo | null;
    pendingTrayAction?: { id: number; type: 'TOGGLE_POMO' } | null;
  }> {
    try {
      const res = await fetch(apiUrl('/api/daemon/heartbeat'), { method: 'POST' });
      if (res.ok) return await res.json();
    } catch {
      // Ignore
    }
    return { ok: false };
  },

  async confirmWorkReturnFromDaemon(): Promise<{
    ok: boolean;
    alreadyConfirmed?: boolean;
    openApp?: boolean;
    reason?: string;
    record?: any;
  }> {
    try {
      const res = await fetch(apiUrl('/api/daemon/confirm-work-return'), { method: 'POST' });
      if (res.ok) return await res.json();
    } catch {
      // Ignore
    }
    return { ok: false };
  },

  async dismissReturnHomeSuggestion(shiftDateStr: string): Promise<{ ok: boolean }> {
    try {
      const res = await fetch(apiUrl('/api/daemon/dismiss-return-suggestion'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftDateStr }),
      });
      if (res.ok) return await res.json();
    } catch {
      // Ignore
    }
    return { ok: false };
  },

  async syncPomodoroStateToDaemon(state: {
    active: boolean;
    running: boolean;
    mode: 'POMODORO' | 'FLOWTIME';
    displayClock: string;
    strikeTitle: string;
  }): Promise<void> {
    try {
      await fetch(apiUrl('/api/daemon/pomodoro-state'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      });
    } catch {
      // Ignore when offline
    }
  },

  async getAutoStartStatus(): Promise<AutoStartStatusInfo> {
    try {
      const res = await fetch(apiUrl('/api/os/autostart'));
      if (res.ok) return await res.json();
    } catch {
      // Ignore
    }
    return { ok: false, enabled: false };
  },

  async setAutoStart(enabled: boolean): Promise<AutoStartStatusInfo> {
    try {
      const res = await fetch(apiUrl('/api/os/autostart'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (res.ok) return await res.json();
    } catch {
      // Ignore
    }
    return { ok: false, enabled: false };
  },

  async openAppWindow(): Promise<{ ok: boolean }> {
    try {
      const res = await fetch(apiUrl('/api/daemon/open-window'), { method: 'POST' });
      if (res.ok) return await res.json();
    } catch {
      // Ignore
    }
    return { ok: false };
  },

  async quitDaemon(): Promise<{ ok: boolean }> {
    try {
      const res = await fetch(apiUrl('/api/daemon/quit'), { method: 'POST' });
      if (res.ok) return await res.json();
    } catch {
      // Ignore
    }
    return { ok: false };
  },

  async uploadProofImage(dataUrl: string, prefix: string = 'pow'): Promise<string> {
    if (!dataUrl || !dataUrl.startsWith('data:image/')) {
      return dataUrl;
    }
    const urlsToTry = [apiUrl('/api/proofs/upload')];
    const fallbackUrl = `${DAEMON_ORIGIN}/api/proofs/upload`;
    if (!urlsToTry.includes(fallbackUrl)) {
      urlsToTry.push(fallbackUrl);
    }
    for (const targetUrl of urlsToTry) {
      try {
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataUrl, prefix }),
        });
        if (res.ok) {
          const parsed = await res.json();
          if (parsed?.filename) {
            return String(parsed.filename);
          }
        }
      } catch {
        // Thử tiếp URL dự phòng hoặc lưu tạm Base64 nếu daemon đang ngoại tuyến
      }
    }
    return dataUrl;
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

  async cleanupOrphanProofs(): Promise<{
    ok: boolean;
    removedCount?: number;
    freedBytes?: number;
    remainingCount?: number;
  }> {
    flushPendingDatabaseSave(false);
    try {
      const res = await fetch(apiUrl('/api/proofs/cleanup'), { method: 'POST' });
      if (res.ok) return await res.json();
    } catch {
      // Ignore
    }
    return { ok: false };
  },

  async fetchPortableBackup(includeApiKeys: boolean = false): Promise<any | null> {
    flushPendingDatabaseSave(false);
    try {
      const res = await fetch(
        apiUrl(`/api/backup/portable?includeApiKeys=${includeApiKeys ? '1' : '0'}`)
      );
      if (res.ok) return await res.json();
    } catch {
      // Ignore
    }
    return null;
  },

  async restorePortableBackup(payload: {
    db: MonkDatabaseSchema;
    embeddedProofs?: Record<string, string>;
  }): Promise<{ ok: boolean; db?: MonkDatabaseSchema; restoredProofsCount?: number }> {
    try {
      const res = await fetch(apiUrl('/api/backup/restore-portable'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) return await res.json();
    } catch {
      // Ignore
    }
    return { ok: false };
  },
};
