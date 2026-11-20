import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile, spawn } from 'child_process';
import {
  evaluatePendingDays,
  getCurrentPendingObligations,
  getEffectiveDayStartTime,
  getEffectiveNightStartTime,
  getLawConfig,
  getShiftDateStr,
  isRestDay,
} from './lawEngine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist');
const DATA_DIR = process.env.LEN_NUI_DATA_DIR
  ? path.resolve(process.env.LEN_NUI_DATA_DIR)
  : path.join(ROOT, 'data');
const DAEMON_LOG_PATH = path.join(DATA_DIR, 'daemon.log');
const PROFILE_DIR = path.join(DATA_DIR, 'desktop-window-profile');
const DB_PATH = path.join(DATA_DIR, 'len-nui-db.json');
const DB_BACKUP_PATH = path.join(DATA_DIR, 'len-nui-db.backup.json');
const HEARTBEAT_PATH = path.join(DATA_DIR, 'heartbeat.json');
const TRAY_STATUS_PATH = path.join(DATA_DIR, 'tray-status.json');
const TRAY_NOTIFY_PATH = path.join(DATA_DIR, 'tray-notify.json');
const WALLPAPER_BACKUP_META = path.join(DATA_DIR, 'wallpaper-backup.json');
const ACTIVE_WALLPAPER_PATH = path.join(DATA_DIR, 'monk-active-wallpaper.png');
const SCREEN_CAPTURE_PATH = path.join(DATA_DIR, 'live-screen-capture.png');
const START_BG_VBS = path.join(ROOT, 'scripts', 'Start-Background.vbs');
const TRAY_PS1_PATH = path.join(ROOT, 'scripts', 'tray-helper.ps1');

const PREFERRED_PORT = Number(process.env.PORT || 5173);
const IS_BACKGROUND =
  process.argv.includes('--background') || process.env.LEN_NUI_BACKGROUND === 'true';
const NO_WINDOW = process.env.NO_WINDOW === 'true';
const NO_TRAY = process.env.NO_TRAY === 'true';
const SKIP_OS_SIDE_EFFECTS = process.env.SKIP_OS_SIDE_EFFECTS === 'true';
const REGISTRY_RUN_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const REGISTRY_VALUE_NAME = 'LenNuiMonkMode';
const PROOFS_DIR = path.join(DATA_DIR, 'proofs');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');

export function isAllowedLocalOrigin(origin) {
  if (!origin) return true;
  const trimmed = String(origin).trim();
  if (!trimmed || trimmed === 'null') return true;
  return /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(trimmed);
}

let actualPort = PREFERRED_PORT;
const startedAt = Date.now();
let lastHeartbeatAt = 0;
let lastEvaluationAt = 0;
let dbUpdatedAt = 0;
let isMonkModeLocked = false;
let isAlarmHijackActive = false;
let processGuardEnabled = false;
let activeWhitelist = [];
let trayChild = null;
let watchdogTimer = null;
let lastReminderSent = { shiftDateStr: '', thirtyMin: false, tenMin: false };
let lastScheduleNotified = { shiftDateStr: '', notifiedKeys: new Set() };
let mockAutoStartEnabled = true;

let processGuardTimer = null;
let isProcessGuardBusy = false;
let recentBlockedProcesses = [];

let lastWatchdogWallClockMs = Date.now();
let lastSuggestedReturnDate = '';
let dismissedReturnDate = '';
let suggestedReturnHome = null;
let lastKnownIdleSec = 0;
let lastIdleCheckAtMs = 0;
let livePomodoroTrayState = null;
let pendingTrayAction = null;

export const DEFAULT_DISTRACTING_PROCESSES = [
  'steam',
  'epicgameslauncher',
  'riotclientservices',
  'leagueclient',
  'valorant',
  'discord',
  'spotify',
  'vlc',
  'netflix',
  'tiktok',
];

export const SAFE_SYSTEM_PROCESSES = new Set([
  'electron',
  'explorer',
  'powershell',
  'pwsh',
  'cmd',
  'taskmgr',
  'applicationframehost',
  'systemsettings',
  'textinputhost',
  'code',
  'chrome',
  'msedge',
  'node',
]);

export function formatDurationHMServer(mins) {
  const m = Math.max(0, Math.round(mins || 0));
  if (m < 60) return `${m}p`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h${String(r).padStart(2, '0')}p`;
}

export function findProcessesToBlock(
  runningApps = [],
  whitelist = [],
  distractingList = DEFAULT_DISTRACTING_PROCESSES
) {
  const allowedSet = new Set(
    (Array.isArray(whitelist) ? whitelist : [])
      .map((s) => String(s || '').trim().toLowerCase().replace(/\.exe$/i, ''))
      .filter(Boolean)
  );
  const distractingSet = new Set(
    (Array.isArray(distractingList) ? distractingList : DEFAULT_DISTRACTING_PROCESSES).map((s) =>
      String(s || '').trim().toLowerCase().replace(/\.exe$/i, '')
    )
  );
  const matched = [];
  for (const proc of Array.isArray(runningApps) ? runningApps : []) {
    const pName = String(proc?.ProcessName || '').trim().toLowerCase().replace(/\.exe$/i, '');
    if (!pName || SAFE_SYSTEM_PROCESSES.has(pName) || allowedSet.has(pName)) continue;
    if (distractingSet.has(pName)) {
      matched.push(proc);
    }
  }
  return matched;
}

export function computeWorkShiftElapsedNow(db, nowMs = Date.now()) {
  const config = getLawConfig(db);
  const shiftMode = config.workShiftMode || 'DAY';
  const nightStartTime = getEffectiveNightStartTime(config);
  const dayStartTime = getEffectiveDayStartTime(config);
  const shiftDateStr = getShiftDateStr(nowMs, shiftMode, nightStartTime);
  const workStartTime = shiftMode === 'NIGHT' ? nightStartTime : dayStartTime;
  const [sy, sm, sd] = shiftDateStr.split('-').map(Number);
  const [wh, wm] = workStartTime.split(':').map(Number);
  const startMs = new Date(sy, (sm || 1) - 1, sd || 1, wh || 0, wm || 0, 0, 0).getTime();
  const diffMins = Math.round((nowMs - startMs) / 60000);
  const d = new Date(nowMs);
  const nowHHMM = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return {
    shiftDateStr,
    shiftMode,
    workStartTime,
    nowHHMM,
    startMs,
    diffMins,
    isPlausibleArrival: diffMins >= 15 && diffMins <= 16 * 60,
    isSmartAutoDetectWindow: diffMins >= 4 * 60 && diffMins <= 15 * 60,
  };
}

export function shouldSuggestReturnHome(params) {
  const {
    db,
    nowMs = Date.now(),
    gapSinceLastTickMs = 0,
    lastSuggestedShiftDate = '',
    dismissedShiftDate = '',
    triggerReason = 'watchdog',
    idleJustResumed = false,
  } = params || {};

  if (!db || !db.session) return { shouldSuggest: false, info: null };
  const info = computeWorkShiftElapsedNow(db, nowMs);
  if (db.dailyWorkShiftLogs?.[info.shiftDateStr]) {
    return { shouldSuggest: false, info };
  }
  if (isRestDay(db, info.shiftDateStr, getLawConfig(db))) {
    return { shouldSuggest: false, info };
  }
  if (lastSuggestedShiftDate === info.shiftDateStr || dismissedShiftDate === info.shiftDateStr) {
    return { shouldSuggest: false, info };
  }
  if (!info.isSmartAutoDetectWindow) {
    return { shouldSuggest: false, info };
  }
  const triggeredByActivity =
    triggerReason === 'startup' || gapSinceLastTickMs >= 3 * 60 * 1000 || idleJustResumed;
  return { shouldSuggest: triggeredByActivity, info };
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }
}

function logDaemon(message) {
  try {
    ensureDataDir();
    const line = `[${new Date().toISOString()}] ${message}\r\n`;
    if (fs.existsSync(DAEMON_LOG_PATH) && fs.statSync(DAEMON_LOG_PATH).size > 65536) {
      fs.writeFileSync(DAEMON_LOG_PATH, line, 'utf-8');
    } else {
      fs.appendFileSync(DAEMON_LOG_PATH, line, 'utf-8');
    }
  } catch {
    // Ignore log error
  }
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJsonAtomic(filePath, data) {
  ensureDataDir();
  const content = JSON.stringify(data, null, 2);
  const tmpPath = `${filePath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // Ignore cleanup error
    }
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

let lastDbBackupAt = 0;

function getDbRichnessScore(db) {
  if (!db || typeof db !== 'object') return 0;
  const goals = Array.isArray(db.peakGoals) ? db.peakGoals.length : 0;
  const milestones = Array.isArray(db.peakGoals)
    ? db.peakGoals.reduce((s, g) => s + (Array.isArray(g?.milestones) ? g.milestones.length : 0), 0)
    : 0;
  const ritualItems = Array.isArray(db.ritualGroups)
    ? db.ritualGroups.reduce((s, g) => s + (Array.isArray(g?.items) ? g.items.length : 0), 0)
    : 0;
  const defaultGroupIds = new Set(['ritual-grp-morning', 'ritual-grp-return-home', 'ritual-grp-study-desk']);
  const customGroups = Array.isArray(db.ritualGroups)
    ? db.ritualGroups.filter((g) => g && !defaultGroupIds.has(g.id)).length
    : 0;
  const strikes = Array.isArray(db.dailyStrikes) ? db.dailyStrikes.length : 0;
  const violations = Array.isArray(db.violations) ? db.violations.length : 0;
  const journals = Array.isArray(db.reflectionJournals) ? db.reflectionJournals.length : 0;
  const scrolls = Array.isArray(db.sacredScrolls) ? db.sacredScrolls.length : 0;
  const sideQuests = Array.isArray(db.session?.sideQuests) ? db.session.sideQuests.length : 0;
  const optNotes = Array.isArray(db.optimizationNotes) ? db.optimizationNotes.length : 0;
  const hasSchedule = db.climbingSchedulePlan && Array.isArray(db.climbingSchedulePlan.days) ? 1 : 0;
  return (
    goals * 1000 +
    milestones * 100 +
    ritualItems * 50 +
    strikes * 30 +
    violations * 20 +
    journals * 15 +
    scrolls * 15 +
    sideQuests * 10 +
    customGroups * 10 +
    optNotes * 10 +
    hasSchedule * 25
  );
}

function isEssentiallyEmptyDb(db) {
  if (!db || typeof db !== 'object' || !db.session) return true;
  return getDbRichnessScore(db) === 0;
}

function extractBalancedJsonObject(str, startIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  const maxEnd = Math.min(str.length, startIndex + 2_000_000);
  for (let i = startIndex; i < maxEnd; i++) {
    const ch = str[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return str.slice(startIndex, i + 1);
    }
  }
  return null;
}

function tryRecoverFromChromiumLevelDb() {
  try {
    if (fs.existsSync(DB_PATH)) return false;
    const levelDbDir = path.join(PROFILE_DIR, 'Default', 'Local Storage', 'leveldb');
    if (!fs.existsSync(levelDbDir)) return false;

    const files = fs
      .readdirSync(levelDbDir)
      .filter((name) => name.endsWith('.log') || name.endsWith('.ldb'))
      .map((name) => path.join(levelDbDir, name));

    const candidates = [];
    for (const filePath of files) {
      let buf;
      try {
        buf = fs.readFileSync(filePath);
      } catch {
        continue;
      }
      const views = [
        buf.toString('utf16le'),
        buf.length > 1 ? buf.subarray(1).toString('utf16le') : '',
        buf.toString('utf8'),
      ];
      for (const text of views) {
        if (!text) continue;
        let idx = 0;
        while (true) {
          const start = text.indexOf('{"session":', idx);
          if (start === -1) break;
          const jsonStr = extractBalancedJsonObject(text, start);
          if (jsonStr) {
            try {
              const parsed = JSON.parse(jsonStr);
              if (parsed?.session?.id && Array.isArray(parsed.peakGoals)) {
                candidates.push(parsed);
              }
            } catch {
              // Skip split/corrupted record
            }
          }
          idx = start + 11;
        }
      }
    }

    if (candidates.length === 0) return false;
    candidates.sort((a, b) => {
      const diff = getDbRichnessScore(b) - getDbRichnessScore(a);
      if (diff !== 0) return diff;
      return (b.session?.lastActiveAt || 0) - (a.session?.lastActiveAt || 0);
    });

    const best = candidates[0];
    if (getDbRichnessScore(best) <= 0) return false;
    writeJsonAtomic(DB_PATH, best);
    logDaemon(
      `Auto-recovered user DB from Chromium LevelDB (session=${best.session.id}, score=${getDbRichnessScore(best)})`
    );
    return true;
  } catch (err) {
    logDaemon(`Chromium LevelDB auto-recovery error: ${String(err)}`);
    return false;
  }
}

function ensureProofsDir() {
  ensureDataDir();
  if (!fs.existsSync(PROOFS_DIR)) {
    fs.mkdirSync(PROOFS_DIR, { recursive: true });
  }
}

function getProofExtFromMime(mime) {
  const lower = String(mime || '').toLowerCase();
  if (lower.includes('png')) return '.png';
  if (lower.includes('webp')) return '.webp';
  return '.jpg';
}

function saveProofDataUrlToFile(dataUrl, prefix = 'pow') {
  if (typeof dataUrl !== 'string') return dataUrl;
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/i.exec(dataUrl.trim());
  if (!match) return dataUrl;
  ensureProofsDir();
  const ext = getProofExtFromMime(match[1]);
  const safePrefix =
    String(prefix || 'pow')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 24) || 'pow';
  const unique = `${safePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
  const filePath = path.join(PROOFS_DIR, unique);
  fs.writeFileSync(filePath, Buffer.from(match[2], 'base64'));
  return unique;
}

function extractEmbeddedProofsFromDb(db) {
  if (!db || typeof db !== 'object') return { db, migratedCount: 0 };
  let migratedCount = 0;

  const processStrike = (s) => {
    if (!s || typeof s !== 'object') return s;
    let changed = false;
    let nextPhotoUri = s.proofPhotoUri;
    if (typeof nextPhotoUri === 'string' && nextPhotoUri.startsWith('data:image/')) {
      nextPhotoUri = saveProofDataUrlToFile(nextPhotoUri, 'pow');
      migratedCount++;
      changed = true;
    }
    let nextList = s.proofPhotosList;
    if (Array.isArray(nextList)) {
      let listChanged = false;
      const mapped = nextList.map((p) => {
        if (p && typeof p.uri === 'string' && p.uri.startsWith('data:image/')) {
          migratedCount++;
          listChanged = true;
          return { ...p, uri: saveProofDataUrlToFile(p.uri, 'pow') };
        }
        return p;
      });
      if (listChanged) {
        nextList = mapped;
        changed = true;
      }
    }
    return changed ? { ...s, proofPhotoUri: nextPhotoUri, proofPhotosList: nextList } : s;
  };

  const nextStrikes = Array.isArray(db.dailyStrikes) ? db.dailyStrikes.map(processStrike) : db.dailyStrikes;

  const nextScrolls = Array.isArray(db.sacredScrolls)
    ? db.sacredScrolls.map((sc) => {
        if (!sc || typeof sc.snapshotJson !== 'string' || !sc.snapshotJson.includes('data:image/')) {
          return sc;
        }
        try {
          const snap = JSON.parse(sc.snapshotJson);
          if (Array.isArray(snap.strikes)) {
            snap.strikes = snap.strikes.map(processStrike);
            return { ...sc, snapshotJson: JSON.stringify(snap) };
          }
        } catch {
          // Ignore malformed snapshot
        }
        return sc;
      })
    : db.sacredScrolls;

  if (migratedCount === 0) return { db, migratedCount: 0 };
  return {
    db: {
      ...db,
      dailyStrikes: nextStrikes,
      sacredScrolls: nextScrolls,
    },
    migratedCount,
  };
}

function writeRotatingBackup(dbObj) {
  try {
    ensureDataDir();
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const filePath = path.join(BACKUPS_DIR, `len-nui-db-${y}-${m}-${d}_${hh}.json`);
    writeJsonAtomic(filePath, dbObj);

    const files = fs
      .readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith('len-nui-db-') && f.endsWith('.json'))
      .map((f) => ({
        name: f,
        fullPath: path.join(BACKUPS_DIR, f),
        mtimeMs: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs,
      }))
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    for (let i = 7; i < files.length; i++) {
      try {
        fs.unlinkSync(files[i].fullPath);
      } catch {
        // Ignore cleanup failure
      }
    }
  } catch (err) {
    logDaemon(`Rotating backup write warning: ${String(err)}`);
  }
}

function normalizeProofBasename(uri) {
  if (!uri || typeof uri !== 'string') return null;
  const trimmed = uri.trim();
  if (!trimmed || /^(data:|https?:|blob:|file:)/i.test(trimmed)) return null;
  const stripped = trimmed.replace(/^\/?api\/proofs\//i, '').replace(/^\/+/, '');
  const base = path.basename(stripped);
  return base && base !== '.' && base !== '..' ? base : null;
}

function collectReferencedProofNames(db) {
  const referenced = new Set();
  if (!db || typeof db !== 'object') return referenced;

  const inspectStrike = (s) => {
    if (!s || typeof s !== 'object') return;
    const mainName = normalizeProofBasename(s.proofPhotoUri);
    if (mainName) referenced.add(mainName);
    if (Array.isArray(s.proofPhotosList)) {
      for (const item of s.proofPhotosList) {
        const nm = normalizeProofBasename(item?.uri);
        if (nm) referenced.add(nm);
      }
    }
  };

  if (Array.isArray(db.dailyStrikes)) {
    for (const s of db.dailyStrikes) inspectStrike(s);
  }
  if (Array.isArray(db.sacredScrolls)) {
    for (const sc of db.sacredScrolls) {
      if (!sc || typeof sc.snapshotJson !== 'string') continue;
      try {
        const snap = JSON.parse(sc.snapshotJson);
        if (Array.isArray(snap?.strikes)) {
          for (const s of snap.strikes) inspectStrike(s);
        }
      } catch {
        // Ignore malformed snapshot
      }
    }
  }
  return referenced;
}

function cleanupOrphanProofsOnDisk(db) {
  ensureProofsDir();
  const referenced = collectReferencedProofNames(db);
  let removedCount = 0;
  let freedBytes = 0;
  const entries = fs.readdirSync(PROOFS_DIR);
  for (const entry of entries) {
    const fullPath = path.join(PROOFS_DIR, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (!stat.isFile()) continue;
      if (!referenced.has(entry)) {
        freedBytes += stat.size;
        fs.unlinkSync(fullPath);
        removedCount++;
      }
    } catch {
      // Ignore single-file error
    }
  }
  return { ok: true, removedCount, freedBytes, remainingCount: Math.max(0, entries.length - removedCount) };
}

function stripApiKeysFromDb(rawDb) {
  const cloned = JSON.parse(JSON.stringify(rawDb));
  if (cloned?.climbingSchedulePlan) {
    delete cloned.climbingSchedulePlan.geminiApiKey;
    delete cloned.climbingSchedulePlan.externalApiKeys;
  }
  if (Array.isArray(cloned?.savedScheduleProfiles)) {
    for (const p of cloned.savedScheduleProfiles) {
      if (p?.plan) {
        delete p.plan.geminiApiKey;
        delete p.plan.externalApiKeys;
      }
    }
  }
  return cloned;
}

function buildPortableBackupBundle(rawDb, includeApiKeys = false) {
  const dbCopy = includeApiKeys ? JSON.parse(JSON.stringify(rawDb)) : stripApiKeysFromDb(rawDb);
  const referenced = collectReferencedProofNames(dbCopy);
  const embeddedProofs = {};
  if (fs.existsSync(PROOFS_DIR)) {
    for (const fileName of referenced) {
      const fullPath = path.join(PROOFS_DIR, fileName);
      try {
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;
        const ext = path.extname(fileName).toLowerCase();
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        const b64 = fs.readFileSync(fullPath).toString('base64');
        embeddedProofs[fileName] = `data:${mime};base64,${b64}`;
      } catch {
        // Skip unreadable image
      }
    }
  }
  return {
    format: 'LEN_NUI_PORTABLE_BACKUP_V1',
    exportedAt: Date.now(),
    includesApiKeys: Boolean(includeApiKeys),
    db: dbCopy,
    embeddedProofs,
  };
}

function restorePortableBackupBundle(payload) {
  const incomingRawDb = payload?.db;
  if (!incomingRawDb || !incomingRawDb.session || !Array.isArray(incomingRawDb.peakGoals)) {
    return { ok: false, error: 'Dữ liệu sao lưu không hợp lệ.' };
  }
  ensureProofsDir();
  let restoredProofsCount = 0;
  const embedded = payload?.embeddedProofs;
  if (embedded && typeof embedded === 'object') {
    for (const [rawName, dataUrl] of Object.entries(embedded)) {
      const safeName = path.basename(String(rawName || '').trim());
      if (!safeName || safeName !== rawName || safeName.includes('..')) continue;
      if (typeof dataUrl !== 'string') continue;
      const match = /^data:image\/[a-zA-Z0-9.+-]+;base64,([\s\S]+)$/i.exec(dataUrl.trim());
      if (!match) continue;
      try {
        fs.writeFileSync(path.join(PROOFS_DIR, safeName), Buffer.from(match[1], 'base64'));
        restoredProofsCount++;
      } catch {
        // Ignore single proof write failure
      }
    }
  }
  const extracted = extractEmbeddedProofsFromDb(incomingRawDb);
  const finalDb = extracted.db;
  writeJsonAtomic(DB_PATH, finalDb);
  dbUpdatedAt = Date.now();
  return { ok: true, db: finalDb, restoredProofsCount };
}

function runPowerShell(script) {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 10000, windowsHide: true },
      (error, stdout, stderr) => {
        resolve({
          ok: !error,
          stdout: (stdout || '').trim(),
          stderr: (stderr || '').trim(),
        });
      }
    );
  });
}

function pushTrayNotification(title, body, level = 'info') {
  if (NO_TRAY) return;
  try {
    writeJsonAtomic(TRAY_NOTIFY_PATH, {
      ts: Date.now(),
      title,
      body,
      level,
    });
  } catch {
    // Ignore
  }
}

function formatHHMM(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function updateTrayStatus(db, pendingInfo) {
  try {
    const streak = db?.session?.currentStreak ?? 0;
    const pendingCount = pendingInfo?.findings?.length ?? 0;
    const cutoffStr = pendingInfo?.cutoffMs ? formatHHMM(pendingInfo.cutoffMs) : '23:59';
    const now = Date.now();

    let workShiftConfirmed = false;
    let workShiftMenuLabel = '🏠 Chốt Giờ Đi Làm Hôm Nay (Mở App)';
    if (db?.session) {
      const workInfo = computeWorkShiftElapsedNow(db, now);
      const existingShift = db.dailyWorkShiftLogs?.[workInfo.shiftDateStr];
      if (existingShift) {
        workShiftConfirmed = true;
        workShiftMenuLabel = existingShift.isDayOffNoWork
          ? '🌴 Hôm nay: Nghỉ làm (0h)'
          : `✅ Đã chốt giờ làm: ${formatDurationHMServer(existingShift.workDurationMins)}`;
      } else if (workInfo.isPlausibleArrival) {
        workShiftMenuLabel = `🏠 Xác Nhận Đã Đi Làm Về (${workInfo.workStartTime}→${workInfo.nowHHMM} = ${formatDurationHMServer(
          workInfo.diffMins
        )})`;
      }
    }

    const pomoActive = Boolean(livePomodoroTrayState?.active);
    const pomoRunning = Boolean(livePomodoroTrayState?.running);
    const pomoModeLabel = livePomodoroTrayState?.mode === 'FLOWTIME' ? 'Flowtime' : 'Pomodoro';
    const pomoClock = livePomodoroTrayState?.displayClock || '00:00';
    const pomoMenuLabel = pomoActive
      ? `${pomoRunning ? '⏸ Tạm Dừng' : '▶ Tiếp Tục'} ${pomoModeLabel} (${pomoClock})`
      : '⏱️ Mở App Bắt Đầu Pomodoro';

    const menuLabel =
      pomoActive && pomoRunning
        ? `🔥 ${pomoModeLabel} ${pomoClock} | Streak ${streak}d`
        : db?.session
        ? `Streak: ${streak} ngày | Việc còn lại: ${pendingCount} (Chốt ${cutoffStr})`
        : 'Lên Núi — Chưa có phiên hoạt động';
    const tooltip =
      pomoActive && pomoRunning
        ? `Lên Núi • ${pomoModeLabel} ${pomoClock}`
        : db?.session
        ? `Lên Núi • Streak ${streak}d • Còn ${pendingCount} mục`
        : 'Lên Núi — Đang chạy nền';
    const summaryTitle =
      pendingCount > 0
        ? `Còn ${pendingCount} hạng mục trước ${cutoffStr}`
        : `Hôm nay sạch sẽ! (Streak ${streak} ngày)`;
    const summaryBody =
      pendingCount > 0
        ? pendingInfo.findings.map((f) => f.reason).join(' ')
        : `Còn ${pendingInfo?.minutesLeft ?? 0} phút đến giờ chốt sổ (${cutoffStr}). Giữ vững kỷ luật!`;

    writeJsonAtomic(TRAY_STATUS_PATH, {
      updatedAt: now,
      streak,
      pendingCount,
      cutoffStr,
      menuLabel,
      tooltip,
      summaryTitle,
      summaryBody,
      workShiftConfirmed,
      workShiftMenuLabel,
      pomoMenuLabel,
    });
  } catch {
    // Ignore
  }
}

async function getWindowsIdleSeconds() {
  const ps = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class IdleCheck {
  [StructLayout(LayoutKind.Sequential)]
  public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
  public static uint GetIdleSec() {
    LASTINPUTINFO lii = new LASTINPUTINFO();
    lii.cbSize = (uint)Marshal.SizeOf(typeof(LASTINPUTINFO));
    if (!GetLastInputInfo(ref lii)) return 0;
    return (uint)((Environment.TickCount - (int)lii.dwTime) / 1000);
  }
}
"@
Write-Output ([IdleCheck]::GetIdleSec())
`;
  const res = await runPowerShell(ps);
  if (!res.ok) return null;
  const parsed = Number(res.stdout);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function enforceProcessGuardTick() {
  if (
    !isMonkModeLocked ||
    !processGuardEnabled ||
    isProcessGuardBusy ||
    SKIP_OS_SIDE_EFFECTS ||
    process.platform !== 'win32'
  ) {
    return;
  }
  isProcessGuardBusy = true;
  try {
    const ps = `Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json -Compress`;
    const out = await runPowerShell(ps);
    if (!out.ok || !out.stdout) return;
    let apps = [];
    try {
      const parsed = JSON.parse(out.stdout);
      apps = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      apps = [];
    }
    const toBlock = findProcessesToBlock(apps, activeWhitelist);
    for (const proc of toBlock) {
      const pid = Number(proc.Id);
      if (!Number.isFinite(pid) || pid <= 0) continue;
      await runPowerShell(`Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`);
      const entry = {
        processName: String(proc.ProcessName || ''),
        title: String(proc.MainWindowTitle || ''),
        timestamp: Date.now(),
      };
      recentBlockedProcesses = [entry, ...recentBlockedProcesses].slice(0, 20);
      logDaemon(`Process Guard closed distracting app: ${entry.processName} (${entry.title})`);
      pushTrayNotification(
        `🛡️ Process Guard đã chặn: ${entry.processName}`,
        `Đã tự đóng "${entry.title || entry.processName}" vì đang bật Kỷ Luật Monk Mode.`,
        'warning'
      );
    }
  } finally {
    isProcessGuardBusy = false;
  }
}

async function checkSmartIdleReturnHomeTick() {
  if (SKIP_OS_SIDE_EFFECTS || process.platform !== 'win32') return;
  const rawDb = readJsonSafe(DB_PATH);
  if (!rawDb || !rawDb.session) return;
  const info = computeWorkShiftElapsedNow(rawDb, Date.now());
  if (
    rawDb.dailyWorkShiftLogs?.[info.shiftDateStr] ||
    !info.isSmartAutoDetectWindow ||
    lastSuggestedReturnDate === info.shiftDateStr ||
    dismissedReturnDate === info.shiftDateStr
  ) {
    return;
  }
  const now = Date.now();
  if (now - lastIdleCheckAtMs < 60000) return;
  lastIdleCheckAtMs = now;
  const idleSec = await getWindowsIdleSeconds();
  if (idleSec === null) return;
  const idleJustResumed = lastKnownIdleSec >= 1200 && idleSec < 60;
  lastKnownIdleSec = idleSec;
  if (idleJustResumed) {
    const decision = shouldSuggestReturnHome({
      db: rawDb,
      nowMs: now,
      gapSinceLastTickMs: 0,
      lastSuggestedShiftDate: lastSuggestedReturnDate,
      dismissedShiftDate: dismissedReturnDate,
      triggerReason: 'idle-resume',
      idleJustResumed: true,
    });
    if (decision.shouldSuggest && decision.info) {
      lastSuggestedReturnDate = decision.info.shiftDateStr;
      suggestedReturnHome = {
        shiftDateStr: decision.info.shiftDateStr,
        shiftMode: decision.info.shiftMode,
        workStartTime: decision.info.workStartTime,
        detectedHHMM: decision.info.nowHHMM,
        detectedAtMs: now,
        estimatedWorkMins: decision.info.diffMins,
      };
      pushTrayNotification(
        `🏠 Chào mừng bạn đi làm về lúc ${decision.info.nowHHMM}!`,
        `Chuột phải biểu tượng Lên Núi ở khay hệ thống chọn "Xác Nhận Đã Đi Làm Về" để chốt ${formatDurationHMServer(
          decision.info.diffMins
        )} & tính Quỹ Rảnh hôm nay.`,
        'info'
      );
    }
  }
}

function recordHeartbeat(nowMs, maxObs) {
  lastHeartbeatAt = nowMs;
  const prev = readJsonSafe(HEARTBEAT_PATH);
  const nextMax = Math.max(nowMs, maxObs || 0, prev?.maxObservedAt || 0, prev?.lastActiveAt || 0);
  writeJsonAtomic(HEARTBEAT_PATH, {
    lastActiveAt: nowMs,
    maxObservedAt: nextMax,
    pid: process.pid,
  });
}

function flushShutdownTimestamps() {
  try {
    const now = Date.now();
    const hb = readJsonSafe(HEARTBEAT_PATH);
    const maxObs = Math.max(now, hb?.maxObservedAt || 0, hb?.lastActiveAt || 0);
    recordHeartbeat(now, maxObs);
    const db = readJsonSafe(DB_PATH);
    if (db && db.session) {
      db.session.lastActiveAt = now;
      db.session.maxObservedAt = Math.max(now, db.session.maxObservedAt || 0, maxObs);
      writeJsonAtomic(DB_PATH, db);
    }
  } catch {
    // Ignore during shutdown
  }
}

/**
 * Đọc DB & xét duyệt các ngày còn tồn đọng TRƯỚC khi ghi đè lastActiveAt = now,
 * nhằm phát hiện chính xác trường hợp người dùng tắt máy trước giờ chốt sổ hôm trước.
 */
function runBackgroundEvaluation(triggerReason = 'watchdog') {
  ensureDataDir();
  const now = Date.now();
  const hb = readJsonSafe(HEARTBEAT_PATH);
  const rawDb = readJsonSafe(DB_PATH);

  if (!rawDb || !rawDb.session) {
    recordHeartbeat(now, now);
    updateTrayStatus(null, null);
    return { db: null, evaluated: false };
  }

  // Tự động tách ảnh Proof-of-Work Base64 cũ ra thư mục data/proofs/ nếu còn tồn đọng
  const extracted = extractEmbeddedProofsFromDb(rawDb);
  const cleanRawDb = extracted.db;

  // Khôi phục lastActiveAt & maxObservedAt mới nhất từ heartbeat.json nếu DB chưa kịp ghi trước lúc sập nguồn
  const hydratedDb = {
    ...cleanRawDb,
    session: {
      ...cleanRawDb.session,
      lastActiveAt: Math.max(cleanRawDb.session.lastActiveAt || 0, hb?.lastActiveAt || 0) || cleanRawDb.session.startTime || now,
      maxObservedAt: Math.max(
        cleanRawDb.session.maxObservedAt || 0,
        hb?.maxObservedAt || 0,
        cleanRawDb.session.lastActiveAt || 0
      ),
    },
  };

  isMonkModeLocked = Boolean(hydratedDb.session.isMonkModeOn);

  const config = getLawConfig(hydratedDb);
  const todayShiftStr = getShiftDateStr(
    now,
    config.workShiftMode,
    getEffectiveNightStartTime(config)
  );
  const evalRes = evaluatePendingDays(hydratedDb, todayShiftStr, now);
  lastEvaluationAt = now;

  let activeDb = evalRes.db;
  if (evalRes.changed || extracted.migratedCount > 0) {
    activeDb = {
      ...activeDb,
      session: {
        ...activeDb.session,
        lastActiveAt: now,
        maxObservedAt: Math.max(now, activeDb.session.maxObservedAt || 0),
      },
    };
    writeJsonAtomic(DB_PATH, activeDb);
    dbUpdatedAt = now;

    if (evalRes.newViolations.length > 0) {
      const offlineNote = evalRes.offlineReport?.missedDeadlineWhileOffline
        ? ' (Phát hiện tắt máy trước giờ chốt sổ)'
        : '';
      pushTrayNotification(
        `Lên Núi — Phát hiện ${evalRes.newViolations.length} vi phạm${offlineNote}`,
        evalRes.newViolations[0]?.reason || 'Bạn có ngày chưa hoàn thành nghĩa vụ Luật Núi.',
        'error'
      );
      if (activeDb.session.autoOpenOnViolation !== false && !NO_WINDOW) {
        focusOrLaunchDesktopWindow(`http://127.0.0.1:${actualPort}`);
      }
    } else if (evalRes.cleanDays.length > 0) {
      pushTrayNotification(
        'Lên Núi — Chốt ngày sạch sẽ!',
        `Hoàn thành trọn vẹn ${evalRes.cleanDays.length} ngày qua. Streak hiện tại: ${activeDb.session.currentStreak} ngày.`,
        'info'
      );
    }
  }

  // Cập nhật heartbeat mới nhất SAU khi đánh giá bù xong
  recordHeartbeat(now, activeDb.session.maxObservedAt || now);

  // Kiểm tra phát hiện "Vừa đi làm về" (sau khi bật máy hoặc máy ngủ dậy giữa ca -> mở khóa)
  const gapSinceLastTickMs = lastWatchdogWallClockMs > 0 ? Math.max(0, now - lastWatchdogWallClockMs) : 0;
  lastWatchdogWallClockMs = now;
  if (activeDb.dailyWorkShiftLogs?.[todayShiftStr]) {
    suggestedReturnHome = null;
  } else {
    const returnDecision = shouldSuggestReturnHome({
      db: activeDb,
      nowMs: now,
      gapSinceLastTickMs,
      lastSuggestedShiftDate: lastSuggestedReturnDate,
      dismissedShiftDate: dismissedReturnDate,
      triggerReason,
    });
    if (returnDecision.shouldSuggest && returnDecision.info) {
      lastSuggestedReturnDate = returnDecision.info.shiftDateStr;
      suggestedReturnHome = {
        shiftDateStr: returnDecision.info.shiftDateStr,
        shiftMode: returnDecision.info.shiftMode,
        workStartTime: returnDecision.info.workStartTime,
        detectedHHMM: returnDecision.info.nowHHMM,
        detectedAtMs: now,
        estimatedWorkMins: returnDecision.info.diffMins,
      };
      pushTrayNotification(
        `🏠 Chào mừng bạn đi làm về lúc ${returnDecision.info.nowHHMM}!`,
        `Chuột phải biểu tượng Lên Núi ở khay hệ thống chọn "Xác Nhận Đã Đi Làm Về" để chốt ${formatDurationHMServer(
          returnDecision.info.diffMins
        )} (${returnDecision.info.workStartTime}→${returnDecision.info.nowHHMM}).`,
        'info'
      );
    }
  }

  // Kiểm tra nghĩa vụ hôm nay & gửi nhắc nhở trước giờ chốt sổ (30p & 10p)
  const pendingInfo = getCurrentPendingObligations(activeDb, now);
  updateTrayStatus(activeDb, pendingInfo);

  if (triggerReason === 'watchdog' && pendingInfo.findings.length > 0) {
    if (lastReminderSent.shiftDateStr !== pendingInfo.shiftDateStr) {
      lastReminderSent = { shiftDateStr: pendingInfo.shiftDateStr, thirtyMin: false, tenMin: false };
    }
    const cutoffStr = formatHHMM(pendingInfo.cutoffMs);
    if (pendingInfo.minutesLeft <= 10 && !lastReminderSent.tenMin) {
      lastReminderSent.tenMin = true;
      lastReminderSent.thirtyMin = true;
      pushTrayNotification(
        `KHẨN: Còn ${pendingInfo.minutesLeft} phút trước giờ chốt (${cutoffStr})!`,
        `Vẫn còn ${pendingInfo.findings.length} mục Luật Núi chưa hoàn thành. Hoàn thành ngay kẻo mất Streak!`,
        'warning'
      );
    } else if (pendingInfo.minutesLeft <= 30 && !lastReminderSent.thirtyMin) {
      lastReminderSent.thirtyMin = true;
      pushTrayNotification(
        `Nhắc nhở: Còn ${pendingInfo.minutesLeft} phút đến giờ chốt (${cutoffStr})`,
        `Bạn còn ${pendingInfo.findings.length} mục chưa xong hôm nay.`,
        'warning'
      );
    }
  }

  // Nhắc đúng khung giờ Lịch Trình AI & Khóa cứng 1 tiếng trước giờ đi làm
  if (triggerReason === 'watchdog' && Array.isArray(activeDb?.climbingSchedulePlan?.days)) {
    if (lastScheduleNotified.shiftDateStr !== todayShiftStr) {
      lastScheduleNotified = { shiftDateStr: todayShiftStr, notifiedKeys: new Set() };
    }
    const [sy, sm, sd] = todayShiftStr.split('-').map(Number);
    const shiftDow = new Date(sy, sm - 1, sd, 12).getDay();
    const todaySchedule = activeDb.climbingSchedulePlan.days.find((d) => d.dayOfWeek === shiftDow);
    if (todaySchedule && Array.isArray(todaySchedule.slots)) {
      const nowDate = new Date(now);
      const nowMins = nowDate.getHours() * 60 + nowDate.getMinutes();
      for (const slot of todaySchedule.slots) {
        if (!slot || !slot.id || !slot.startTime) continue;
        if (lastScheduleNotified.notifiedKeys.has(slot.id)) continue;
        const parts = String(slot.startTime).split(':').map(Number);
        if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) continue;
        const startMins = parts[0] * 60 + parts[1];
        if (slot.kind === 'CLIMB' && nowMins >= startMins - 5 && nowMins <= startMins + 2) {
          lastScheduleNotified.notifiedKeys.add(slot.id);
          pushTrayNotification(
            `⏰ Sắp tới giờ leo núi (${slot.startTime}–${slot.endTime})`,
            `${slot.title}${slot.suggestedTask ? ` — ${slot.suggestedTask}` : ''}`,
            'info'
          );
        } else if (slot.kind === 'PREP_WORK' && nowMins >= startMins - 2 && nowMins <= startMins + 3) {
          lastScheduleNotified.notifiedKeys.add(slot.id);
          pushTrayNotification(
            `🎒 KHÓA CỨNG 1 TIẾNG ĐI LÀM (${slot.startTime}–${slot.endTime})`,
            'Dừng leo núi ngay! Ăn uống, chuẩn bị tư trang và di chuyển đi làm đúng giờ.',
            'warning'
          );
        }
      }
    }
  }

  return { db: activeDb, evaluated: evalRes.changed, evalRes };
}

async function getWindowsAutoStartStatus() {
  if (SKIP_OS_SIDE_EFFECTS) {
    return {
      ok: true,
      enabled: mockAutoStartEnabled,
      command: `wscript.exe "${START_BG_VBS}"`,
      scriptPath: START_BG_VBS,
      simulated: true,
    };
  }
  const ps = `
$val = (Get-ItemProperty -Path '${REGISTRY_RUN_KEY}' -Name '${REGISTRY_VALUE_NAME}' -ErrorAction SilentlyContinue).'${REGISTRY_VALUE_NAME}'
if ($val) { Write-Output $val }
`;
  const res = await runPowerShell(ps);
  const currentCmd = res.stdout || '';
  return {
    ok: res.ok,
    enabled: Boolean(currentCmd),
    command: currentCmd || `wscript.exe "${START_BG_VBS}"`,
    scriptPath: START_BG_VBS,
  };
}

async function setWindowsAutoStart(enabled) {
  const commandStr = `wscript.exe "${START_BG_VBS}"`;
  if (SKIP_OS_SIDE_EFFECTS) {
    mockAutoStartEnabled = Boolean(enabled);
    return {
      ok: true,
      enabled: mockAutoStartEnabled,
      command: commandStr,
      scriptPath: START_BG_VBS,
      simulated: true,
    };
  }

  const escapedCmd = commandStr.replace(/'/g, "''");
  const ps = enabled
    ? `
New-Item -Path '${REGISTRY_RUN_KEY}' -Force | Out-Null
Set-ItemProperty -Path '${REGISTRY_RUN_KEY}' -Name '${REGISTRY_VALUE_NAME}' -Value '${escapedCmd}' -Force
Write-Output 'ENABLED'
`
    : `
Remove-ItemProperty -Path '${REGISTRY_RUN_KEY}' -Name '${REGISTRY_VALUE_NAME}' -ErrorAction SilentlyContinue
Write-Output 'DISABLED'
`;
  const res = await runPowerShell(ps);
  return {
    ok: res.ok,
    enabled: Boolean(enabled) && res.ok,
    command: commandStr,
    scriptPath: START_BG_VBS,
    reason: res.ok ? undefined : res.stderr || 'Không thể cập nhật Registry Windows.',
  };
}

async function setWindowsWallpaper(imagePath) {
  const escaped = imagePath.replace(/'/g, "''");
  const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WallpaperSetter {
    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    public static extern int SystemParametersInfo(int uAction, int uParam, string lpvParam, int fuWinIni);
}
"@
[WallpaperSetter]::SystemParametersInfo(20, 0, '${escaped}', 3) | Out-Null
Write-Output "OK"
`;
  return await runPowerShell(psScript);
}

async function backupCurrentWallpaperIfNeeded() {
  ensureDataDir();
  if (fs.existsSync(WALLPAPER_BACKUP_META)) {
    return JSON.parse(fs.readFileSync(WALLPAPER_BACKUP_META, 'utf-8'));
  }
  const psScript = `(Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name WallPaper -ErrorAction SilentlyContinue).WallPaper`;
  const res = await runPowerShell(psScript);
  const currentPath = res.stdout;
  let backupCopyPath = null;
  if (currentPath && fs.existsSync(currentPath)) {
    const ext = path.extname(currentPath) || '.jpg';
    backupCopyPath = path.join(DATA_DIR, `original-wallpaper-backup${ext}`);
    try {
      fs.copyFileSync(currentPath, backupCopyPath);
    } catch {
      backupCopyPath = currentPath;
    }
  }
  const meta = {
    originalPath: currentPath || '',
    backupCopyPath: backupCopyPath || currentPath || '',
    backedUpAt: Date.now(),
  };
  writeJsonAtomic(WALLPAPER_BACKUP_META, meta);
  return meta;
}

async function restoreOriginalWallpaper() {
  ensureDataDir();
  if (!fs.existsSync(WALLPAPER_BACKUP_META)) {
    return { ok: false, reason: 'Chưa có bản sao lưu hình nền mới.' };
  }
  try {
    const meta = JSON.parse(fs.readFileSync(WALLPAPER_BACKUP_META, 'utf-8'));
    const target =
      meta.backupCopyPath && fs.existsSync(meta.backupCopyPath)
        ? meta.backupCopyPath
        : meta.originalPath;
    if (target && fs.existsSync(target)) {
      await setWindowsWallpaper(target);
      return { ok: true, restoredPath: target };
    }
    return { ok: false, reason: 'Không tìm thấy file hình nền gốc.' };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

async function captureDesktopScreenViaPS() {
  ensureDataDir();
  const escaped = SCREEN_CAPTURE_PATH.replace(/'/g, "''");
  const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bmp.Save('${escaped}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$bmp.Dispose()
Write-Output "SAVED"
`;
  const res = await runPowerShell(psScript);
  if (res.ok && fs.existsSync(SCREEN_CAPTURE_PATH)) {
    const buf = fs.readFileSync(SCREEN_CAPTURE_PATH);
    return `data:image/png;base64,${buf.toString('base64')}`;
  }
  return null;
}

async function setAppWindowTopMost(topMost) {
  const flag = topMost ? '-1' : '-2';
  const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinTopMost {
    [DllImport("user32.dll")]
    public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$procs = Get-Process | Where-Object { $_.MainWindowTitle -like "*LÊN NÚI*" -or $_.MainWindowTitle -like "*ASCEND THE MOUNTAIN*" }
foreach ($p in $procs) {
  if ($p.MainWindowHandle -ne 0) {
    [WinTopMost]::SetWindowPos($p.MainWindowHandle, [IntPtr]${flag}, 0, 0, 0, 0, 0x0001 -bor 0x0002 -bor 0x0040) | Out-Null
    if (${topMost ? '$true' : '$false'}) {
      [WinTopMost]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
    }
  }
}
`;
  await runPowerShell(psScript);
}

async function tryFocusExistingAppWindow() {
  const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class WinFocus {
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
}
"@
$procs = Get-Process | Where-Object { $_.MainWindowTitle -like "*LÊN NÚI*" -or $_.MainWindowTitle -like "*ASCEND THE MOUNTAIN*" }
foreach ($p in $procs) {
  if ($p.MainWindowHandle -ne 0) {
    [WinFocus]::ShowWindow($p.MainWindowHandle, 9) | Out-Null
    [WinFocus]::SetForegroundWindow($p.MainWindowHandle) | Out-Null
    Write-Output "FOCUSED"
    exit 0
  }
}
Write-Output "NONE"
`;
  const res = await runPowerShell(psScript);
  return res.ok && res.stdout.includes('FOCUSED');
}

function findNativeAppHostExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return null;
}

async function cleanupOrphanedAppProfileProcesses() {
  if (SKIP_OS_SIDE_EFFECTS || process.platform !== 'win32') return false;
  const profileLeaf = path.basename(PROFILE_DIR).replace(/'/g, "''");
  const psScript = `
$cutoff = (Get-Date).AddSeconds(-4)
$targets = Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" -ErrorAction SilentlyContinue | Where-Object {
  $_.CommandLine -like "*${profileLeaf}*" -and $_.CommandLine -notlike "*--type=*" -and $_.CreationDate -lt $cutoff
}
if ($targets) {
  $killed = $false
  foreach ($t in $targets) {
    $gp = Get-Process -Id $t.ProcessId -ErrorAction SilentlyContinue
    if ($gp -and $gp.MainWindowHandle -eq 0) {
      Stop-Process -Id $t.ProcessId -Force -ErrorAction SilentlyContinue
      $killed = $true
    }
  }
  if ($killed) { Write-Output "KILLED_ORPHAN" }
}
`;
  const res = await runPowerShell(psScript);
  return Boolean(res.ok && res.stdout.includes('KILLED_ORPHAN'));
}

async function focusOrLaunchDesktopWindow(url = `http://127.0.0.1:${actualPort}`) {
  if (NO_WINDOW) return;
  ensureDataDir();

  const focused = await tryFocusExistingAppWindow();
  if (focused) {
    logDaemon('Focused existing desktop window');
    return;
  }

  // If a headless/windowless instance is holding desktop-window-profile lockfile without any window, clear it first
  const cleanedOrphan = await cleanupOrphanedAppProfileProcesses();
  if (cleanedOrphan) {
    await new Promise((r) => setTimeout(r, 400));
  }

  const hostExe = findNativeAppHostExecutable();
  if (hostExe) {
    console.log(`[LÊN NÚI DESKTOP] Đang mở cửa sổ Desktop App tại: ${url}`);
    logDaemon(`Launching desktop window via ${path.basename(hostExe)} (${url})`);

    if (process.platform === 'win32') {
      const escPs = (v) => `'${String(v).replace(/'/g, "''")}'`;
      const argLine = [
        `--app=${url}`,
        `"--user-data-dir=${PROFILE_DIR}"`,
        '--window-size=1440,920',
        '--no-first-run',
        '--no-default-browser-check',
      ].join(' ');
      const psLaunch = `Start-Process -FilePath ${escPs(hostExe)} -ArgumentList ${escPs(argLine)} -WorkingDirectory ${escPs(ROOT)} -WindowStyle Normal`;
      const launched = await runPowerShell(psLaunch);
      if (launched.ok) return;
      logDaemon(`Start-Process launch failed (${launched.stderr || 'unknown'}), falling back to spawn`);
    }

    const child = spawn(
      hostExe,
      [
        `--app=${url}`,
        `--user-data-dir=${PROFILE_DIR}`,
        '--window-size=1440,920',
        '--no-first-run',
        '--no-default-browser-check',
      ],
      {
        cwd: ROOT,
        detached: true,
        stdio: 'ignore',
      }
    );
    child.unref();
    return;
  }

  logDaemon(`Launching URL via default browser (${url})`);
  await runPowerShell(`Start-Process "${url}"`);
}

function startTrayHelper(port) {
  if (NO_TRAY || SKIP_OS_SIDE_EFFECTS || process.platform !== 'win32') return;
  if (!fs.existsSync(TRAY_PS1_PATH)) return;
  if (trayChild && !trayChild.killed) return;

  try {
    trayChild = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-WindowStyle',
        'Hidden',
        '-File',
        TRAY_PS1_PATH,
        '-ServerUrl',
        `http://127.0.0.1:${port}`,
        '-DataDir',
        DATA_DIR,
        '-ParentPid',
        String(process.pid),
      ],
      {
        cwd: ROOT,
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
      }
    );
    trayChild.unref();
  } catch (err) {
    console.warn('[LÊN NÚI DAEMON] Không thể khởi tạo Tray Icon:', err);
  }
}

function stopTrayHelper() {
  if (trayChild && !trayChild.killed) {
    try {
      trayChild.kill();
    } catch {
      // Ignore
    }
    trayChild = null;
  }
}

function readJsonBody(req, maxBytes = 35 * 1024 * 1024) {
  return new Promise((resolve) => {
    const chunks = [];
    let totalBytes = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      if (tooLarge) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        tooLarge = true;
        resolve({ __payloadTooLarge: true });
        return;
      }
      chunks.push(chunk);
    });
    req.on('error', () => {
      if (!tooLarge) resolve({});
    });
    req.on('end', () => {
      if (tooLarge) return;
      try {
        const raw = Buffer.concat(chunks).toString('utf-8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function checkExistingDaemon(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/daemon/status`, { timeout: 1200 }, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve(Boolean(res.statusCode === 200 && parsed?.ok));
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

function sendPostToDaemon(port, endpoint) {
  return new Promise((resolve) => {
    const req = http.request(
      `http://127.0.0.1:${port}${endpoint}`,
      { method: 'POST', timeout: 2000, headers: { 'Content-Length': '0' } },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url || '/', `http://127.0.0.1:${actualPort}`);
  const pathname = urlObj.pathname;

  if (pathname.startsWith('/api/')) {
    const reqOrigin = req.headers.origin;
    if (reqOrigin && !isAllowedLocalOrigin(reqOrigin)) {
      res.statusCode = 403;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          ok: false,
          error: 'Forbidden cross-origin request to local daemon API.',
        })
      );
      return;
    }
    if (reqOrigin && isAllowedLocalOrigin(reqOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', reqOrigin);
      res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (pathname === '/api/db' && req.method === 'GET') {
      const result = runBackgroundEvaluation('api-db-get');
      res.end(JSON.stringify({ data: result.db || null }));
      return;
    }

    if (pathname === '/api/db' && req.method === 'POST') {
      ensureDataDir();
      const body = await readJsonBody(req);
      if (body?.__payloadTooLarge) {
        res.statusCode = 413;
        res.end(JSON.stringify({ ok: false, error: 'Dữ liệu quá giới hạn cho phép (35MB).' }));
        return;
      }
      if (body?.data && body.data.session) {
        const now = Date.now();
        const extracted = extractEmbeddedProofsFromDb(body.data);
        const incoming = extracted.db;
        const existingDb = readJsonSafe(DB_PATH);
        const allowEmptyOverwrite = body?.allowEmptyOverwrite === true;

        if (
          existingDb &&
          !isEssentiallyEmptyDb(existingDb) &&
          isEssentiallyEmptyDb(incoming) &&
          !allowEmptyOverwrite
        ) {
          logDaemon(
            `Blocked accidental empty DB overwrite (existingScore=${getDbRichnessScore(existingDb)})`
          );
          res.end(
            JSON.stringify({
              ok: false,
              skippedOverwrite: true,
              path: DB_PATH,
            })
          );
          return;
        }

        if (
          existingDb &&
          !isEssentiallyEmptyDb(existingDb) &&
          (!fs.existsSync(DB_BACKUP_PATH) ||
            now - lastDbBackupAt > 300000 ||
            getDbRichnessScore(existingDb) > getDbRichnessScore(incoming))
        ) {
          writeJsonAtomic(DB_BACKUP_PATH, existingDb);
          writeRotatingBackup(existingDb);
          lastDbBackupAt = now;
        }

        incoming.session.lastActiveAt = Math.max(incoming.session.lastActiveAt || 0, now);
        incoming.session.maxObservedAt = Math.max(
          incoming.session.maxObservedAt || 0,
          incoming.session.lastActiveAt,
          now
        );
        isMonkModeLocked = Boolean(incoming.session.isMonkModeOn);
        writeJsonAtomic(DB_PATH, incoming);
        dbUpdatedAt = now;
        recordHeartbeat(now, incoming.session.maxObservedAt);
        const pendingInfo = getCurrentPendingObligations(incoming, now);
        updateTrayStatus(incoming, pendingInfo);
      }
      res.end(JSON.stringify({ ok: true, path: DB_PATH }));
      return;
    }

    if (pathname === '/api/proofs/upload' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const dataUrl = body?.dataUrl;
      if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: 'Dữ liệu ảnh không hợp lệ.' }));
        return;
      }
      const filename = saveProofDataUrlToFile(dataUrl, body?.prefix || 'pow');
      res.end(JSON.stringify({ ok: true, filename, url: `/api/proofs/${filename}` }));
      return;
    }

    if (pathname.startsWith('/api/proofs/') && req.method === 'GET') {
      const rawName = decodeURIComponent(pathname.slice('/api/proofs/'.length));
      const safeName = path.basename(rawName);
      if (!safeName || safeName !== rawName || safeName.includes('..')) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: 'Tên tệp không hợp lệ.' }));
        return;
      }
      const imgPath = path.join(PROOFS_DIR, safeName);
      if (!fs.existsSync(imgPath) || !fs.statSync(imgPath).isFile()) {
        res.statusCode = 404;
        res.end(JSON.stringify({ error: 'Không tìm thấy ảnh bằng chứng.' }));
        return;
      }
      const ext = path.extname(safeName).toLowerCase();
      const contentType =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      fs.createReadStream(imgPath).pipe(res);
      return;
    }

    if (pathname === '/api/daemon/status' && req.method === 'GET') {
      const db = readJsonSafe(DB_PATH);
      const now = Date.now();
      const pendingInfo = db?.session ? getCurrentPendingObligations(db, now) : null;
      const workInfo = db?.session ? computeWorkShiftElapsedNow(db, now) : null;
      res.end(
        JSON.stringify({
          ok: true,
          pid: process.pid,
          port: actualPort,
          startedAt,
          uptimeSec: Math.floor((now - startedAt) / 1000),
          trayRunning: Boolean(trayChild && !trayChild.killed && trayChild.exitCode === null),
          lastHeartbeatAt: lastHeartbeatAt || startedAt,
          lastEvaluationAt: lastEvaluationAt || startedAt,
          dbUpdatedAt,
          workShiftConfirmed: Boolean(
            workInfo && db?.dailyWorkShiftLogs?.[workInfo.shiftDateStr]
          ),
          pendingCutoffMs: pendingInfo?.cutoffMs,
          pendingMinutesLeft: pendingInfo?.minutesLeft,
          pendingViolationsCount: pendingInfo?.findings?.length ?? 0,
          suggestedReturnHome,
          recentBlockedProcesses,
          processGuardActive: Boolean(isMonkModeLocked && processGuardEnabled),
        })
      );
      return;
    }

    if (pathname === '/api/daemon/heartbeat' && req.method === 'POST') {
      const result = runBackgroundEvaluation('ui-heartbeat');
      const actionToDeliver = pendingTrayAction;
      pendingTrayAction = null;
      res.end(
        JSON.stringify({
          ok: true,
          evaluated: result.evaluated,
          lastActiveAt: lastHeartbeatAt,
          dbUpdatedAt,
          suggestedReturnHome,
          pendingTrayAction: actionToDeliver,
        })
      );
      return;
    }

    if (pathname === '/api/daemon/confirm-work-return' && req.method === 'POST') {
      const db = readJsonSafe(DB_PATH);
      if (!db || !db.session) {
        res.end(JSON.stringify({ ok: false, reason: 'Chưa có dữ liệu phiên tu luyện.' }));
        return;
      }
      const now = Date.now();
      const info = computeWorkShiftElapsedNow(db, now);
      if (db.dailyWorkShiftLogs?.[info.shiftDateStr]) {
        suggestedReturnHome = null;
        const rec = db.dailyWorkShiftLogs[info.shiftDateStr];
        pushTrayNotification(
          '✅ Hôm nay đã chốt giờ làm rồi',
          rec.isDayOffNoWork
            ? `Ngày ${info.shiftDateStr}: Đã đánh dấu nghỉ làm (0h).`
            : `Ngày ${info.shiftDateStr}: Đã ghi nhận ${formatDurationHMServer(rec.workDurationMins)}.`,
          'info'
        );
        res.end(JSON.stringify({ ok: true, alreadyConfirmed: true, record: rec }));
        return;
      }
      if (!info.isPlausibleArrival) {
        pushTrayNotification(
          '⏰ Ngoài khung tự động chốt giờ về',
          `Vui lòng tự nhập giờ bắt đầu/kết thúc (hiện cách mốc vào ca ${info.workStartTime} là ${formatDurationHMServer(
            Math.max(0, info.diffMins)
          )}).`,
          'warning'
        );
        await focusOrLaunchDesktopWindow(`http://127.0.0.1:${actualPort}`);
        res.end(JSON.stringify({ ok: false, openApp: true, reason: 'Outside plausible arrival range' }));
        return;
      }
      const record = {
        date: info.shiftDateStr,
        shiftMode: info.shiftMode,
        workStartTime: info.workStartTime,
        workEndTime: info.nowHHMM,
        workStartMs: info.startMs,
        workEndMs: now,
        workDurationMins: info.diffMins,
        prepLockMins: 60,
        confirmedAt: now,
      };
      const updatedDb = {
        ...db,
        dailyWorkShiftLogs: {
          ...(db.dailyWorkShiftLogs || {}),
          [info.shiftDateStr]: record,
        },
        session: {
          ...db.session,
          lastActiveAt: now,
          maxObservedAt: Math.max(now, db.session.maxObservedAt || 0),
        },
      };
      writeJsonAtomic(DB_PATH, updatedDb);
      dbUpdatedAt = now;
      lastSuggestedReturnDate = info.shiftDateStr;
      suggestedReturnHome = null;
      const pendingInfo = getCurrentPendingObligations(updatedDb, now);
      updateTrayStatus(updatedDb, pendingInfo);
      pushTrayNotification(
        `🏠 Đã chốt giờ đi làm: ${formatDurationHMServer(record.workDurationMins)}`,
        `Ngày ${record.date} (${record.workStartTime} → ${record.workEndTime}). Quỹ Thời Gian 24h đã tự cập nhật realtime!`,
        'info'
      );
      res.end(JSON.stringify({ ok: true, record, dbUpdatedAt }));
      return;
    }

    if (pathname === '/api/daemon/dismiss-return-suggestion' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body?.shiftDateStr) {
        dismissedReturnDate = String(body.shiftDateStr);
      }
      suggestedReturnHome = null;
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (pathname === '/api/daemon/pomodoro-state' && req.method === 'POST') {
      const body = await readJsonBody(req);
      livePomodoroTrayState = body?.active
        ? {
            active: true,
            running: Boolean(body.running),
            mode: body.mode === 'FLOWTIME' ? 'FLOWTIME' : 'POMODORO',
            displayClock: String(body.displayClock || '00:00'),
            strikeTitle: String(body.strikeTitle || ''),
            updatedAt: Date.now(),
          }
        : null;
      const db = readJsonSafe(DB_PATH);
      const pendingInfo = db?.session ? getCurrentPendingObligations(db, Date.now()) : null;
      updateTrayStatus(db, pendingInfo);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (pathname === '/api/daemon/tray-pomo-toggle' && req.method === 'POST') {
      if (!livePomodoroTrayState?.active) {
        await focusOrLaunchDesktopWindow(`http://127.0.0.1:${actualPort}`);
        res.end(JSON.stringify({ ok: true, openedWindow: true }));
        return;
      }
      pendingTrayAction = { id: Date.now(), type: 'TOGGLE_POMO' };
      res.end(JSON.stringify({ ok: true, queued: true }));
      return;
    }

    if (pathname === '/api/daemon/open-window' && req.method === 'POST') {
      await focusOrLaunchDesktopWindow(`http://127.0.0.1:${actualPort}`);
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (pathname === '/api/daemon/quit' && req.method === 'POST') {
      res.end(JSON.stringify({ ok: true }));
      flushShutdownTimestamps();
      if (watchdogTimer) clearInterval(watchdogTimer);
      if (processGuardTimer) clearInterval(processGuardTimer);
      stopTrayHelper();
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(0), 500);
      return;
    }

    if (pathname === '/api/os/autostart' && req.method === 'GET') {
      const status = await getWindowsAutoStartStatus();
      res.end(JSON.stringify(status));
      return;
    }

    if (pathname === '/api/os/autostart' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const enabled = Boolean(body?.enabled);
      const result = await setWindowsAutoStart(enabled);
      const db = readJsonSafe(DB_PATH);
      if (db && db.session) {
        db.session.autoStartWithWindows = enabled;
        writeJsonAtomic(DB_PATH, db);
        dbUpdatedAt = Date.now();
      }
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/os/notify' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body?.title || body?.body) {
        pushTrayNotification(body.title || 'Lên Núi', body.body || '', body.level || 'info');
      }
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (pathname === '/api/os/monk-lock' && req.method === 'POST') {
      const body = await readJsonBody(req);
      isMonkModeLocked = Boolean(body?.isMonkModeOn);
      processGuardEnabled = Boolean(body?.processGuardEnabled);
      activeWhitelist = Array.isArray(body?.whitelistedApps) ? body.whitelistedApps : [];
      if (isMonkModeLocked && processGuardEnabled) {
        void enforceProcessGuardTick();
      }
      res.end(JSON.stringify({ ok: true, isMonkModeLocked, processGuardEnabled }));
      return;
    }

    if (pathname === '/api/os/alarm-hijack' && req.method === 'POST') {
      const body = await readJsonBody(req);
      isAlarmHijackActive = Boolean(body?.active);
      await setAppWindowTopMost(isAlarmHijackActive);
      res.end(JSON.stringify({ ok: true, isAlarmHijackActive }));
      return;
    }

    if (pathname === '/api/os/running-apps' && req.method === 'GET') {
      const ps = `Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json -Compress`;
      const out = await runPowerShell(ps);
      let apps = [];
      if (out.ok && out.stdout) {
        try {
          const p = JSON.parse(out.stdout);
          apps = Array.isArray(p) ? p : [p];
        } catch {
          apps = [];
        }
      }
      res.end(JSON.stringify({ apps }));
      return;
    }

    if (pathname === '/api/os/set-wallpaper' && req.method === 'POST') {
      ensureDataDir();
      const body = await readJsonBody(req);
      if (body?.dataUrl) {
        await backupCurrentWallpaperIfNeeded();
        const base64Data = String(body.dataUrl).replace(/^data:image\/\w+;base64,/, '');
        fs.writeFileSync(ACTIVE_WALLPAPER_PATH, Buffer.from(base64Data, 'base64'));
        const r = await setWindowsWallpaper(ACTIVE_WALLPAPER_PATH);
        res.end(JSON.stringify({ ok: r.ok, path: ACTIVE_WALLPAPER_PATH }));
        return;
      }
      res.end(JSON.stringify({ ok: false }));
      return;
    }

    if (pathname === '/api/os/restore-wallpaper' && req.method === 'POST') {
      const r = await restoreOriginalWallpaper();
      res.end(JSON.stringify(r));
      return;
    }

    if (pathname === '/api/os/capture-screen' && req.method === 'GET') {
      const dataUrl = await captureDesktopScreenViaPS();
      res.end(
        JSON.stringify({
          sources: dataUrl
            ? [{ id: 'primary-screen', name: 'Màn hình chính (Windows Desktop)', dataUrl }]
            : [],
        })
      );
      return;
    }

    if (pathname === '/api/proofs/cleanup' && req.method === 'POST') {
      const currentDb = readJsonSafe(DB_PATH);
      const result = cleanupOrphanProofsOnDisk(currentDb);
      res.end(JSON.stringify(result));
      return;
    }

    if (pathname === '/api/backup/portable' && req.method === 'GET') {
      const includeKeys = urlObj.searchParams.get('includeApiKeys') === '1';
      const currentDb = readJsonSafe(DB_PATH);
      if (!currentDb || !currentDb.session) {
        res.statusCode = 404;
        res.end(JSON.stringify({ ok: false, error: 'Chưa có cơ sở dữ liệu trên đĩa.' }));
        return;
      }
      const bundle = buildPortableBackupBundle(currentDb, includeKeys);
      res.end(JSON.stringify(bundle));
      return;
    }

    if (pathname === '/api/backup/restore-portable' && req.method === 'POST') {
      const body = await readJsonBody(req);
      if (body?.__payloadTooLarge) {
        res.statusCode = 413;
        res.end(JSON.stringify({ ok: false, error: 'Gói sao lưu vượt quá giới hạn 35MB.' }));
        return;
      }
      const result = restorePortableBackupBundle(body);
      if (!result.ok) {
        res.statusCode = 400;
      }
      res.end(JSON.stringify(result));
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  let relPath;
  try {
    relPath = decodeURIComponent(pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
  } catch {
    res.statusCode = 400;
    res.end('Bad Request');
    return;
  }
  const distRoot = path.resolve(DIST_DIR);
  const filePath = path.resolve(distRoot, relPath);
  if (filePath !== distRoot && !filePath.startsWith(distRoot + path.sep)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

function onDaemonListening(port) {
  actualPort = port;
  const url = `http://127.0.0.1:${port}`;
  console.log(`[LÊN NÚI DAEMON] Đang chạy nền tại ${url} (PID ${process.pid})`);
  logDaemon(`Daemon listening at ${url} (PID ${process.pid}, background=${IS_BACKGROUND})`);

  // Chạy kiểm tra xét duyệt bù NGAY KHI BẬT MÁY / KHỞI ĐỘNG
  runBackgroundEvaluation('startup');

  // Đồng bộ tự khởi động cùng Windows theo cấu hình DB (chỉ khi chạy thực tế)
  if (!SKIP_OS_SIDE_EFFECTS) {
    const db = readJsonSafe(DB_PATH);
    const shouldAutoStart = db?.session ? db.session.autoStartWithWindows !== false : true;
    setWindowsAutoStart(shouldAutoStart).catch(() => {});
  }

  startTrayHelper(port);

  watchdogTimer = setInterval(() => {
    runBackgroundEvaluation('watchdog');
    void checkSmartIdleReturnHomeTick();
  }, 30000);

  processGuardTimer = setInterval(() => {
    void enforceProcessGuardTick();
  }, 5000);

  if (!IS_BACKGROUND && !NO_WINDOW) {
    focusOrLaunchDesktopWindow(url);
  }
}

server.on('error', async (err) => {
  if (err && err.code === 'EADDRINUSE') {
    const running = await checkExistingDaemon(PREFERRED_PORT);
    if (running) {
      if (!IS_BACKGROUND && !NO_WINDOW) {
        await focusOrLaunchDesktopWindow(`http://127.0.0.1:${PREFERRED_PORT}`);
      }
      process.exit(0);
    }
    console.log(`[LÊN NÚI DESKTOP] Cổng ${PREFERRED_PORT} đang bận bởi tiến trình khác, chuyển sang cổng tự động...`);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : PREFERRED_PORT;
      onDaemonListening(port);
    });
  } else {
    console.error('[LÊN NÚI DESKTOP] Server error:', err);
  }
});

process.on('SIGINT', () => {
  flushShutdownTimestamps();
  if (watchdogTimer) clearInterval(watchdogTimer);
  if (processGuardTimer) clearInterval(processGuardTimer);
  stopTrayHelper();
  process.exit(0);
});
process.on('SIGTERM', () => {
  flushShutdownTimestamps();
  if (watchdogTimer) clearInterval(watchdogTimer);
  if (processGuardTimer) clearInterval(processGuardTimer);
  stopTrayHelper();
  process.exit(0);
});

async function main() {
  ensureDataDir();
  tryRecoverFromChromiumLevelDb();

  const alreadyUp = await checkExistingDaemon(PREFERRED_PORT);
  if (alreadyUp) {
    console.log(`[LÊN NÚI DAEMON] Phát hiện daemon đã chạy nền ở cổng ${PREFERRED_PORT}.`);
    if (!IS_BACKGROUND && !NO_WINDOW) {
      await focusOrLaunchDesktopWindow(`http://127.0.0.1:${PREFERRED_PORT}`);
    }
    process.exit(0);
  }

  server.listen(PREFERRED_PORT, '127.0.0.1', () => {
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : PREFERRED_PORT;
    onDaemonListening(port);
  });
}

const IS_MAIN_MODULE =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (IS_MAIN_MODULE) {
  main();
}
