const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  globalShortcut,
  dialog,
  shell,
  Notification,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');

let mainWindow = null;
let isMonkModeLocked = false;
let isAlarmHijackActive = false;
let devForceQuit = false;
let processGuardInterval = null;
let activeWhitelist = [];
let processGuardEnabled = false;

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'len-nui-db.json');
const WALLPAPER_BACKUP_META = path.join(DATA_DIR, 'wallpaper-backup.json');
const ACTIVE_WALLPAPER_PATH = path.join(DATA_DIR, 'monk-active-wallpaper.png');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
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

async function getCurrentWindowsWallpaper() {
  const psScript = `
$wp = (Get-ItemProperty -Path 'HKCU:\\Control Panel\\Desktop' -Name WallPaper -ErrorAction SilentlyContinue).WallPaper
Write-Output $wp
`;
  const res = await runPowerShell(psScript);
  return res.stdout;
}

async function backupCurrentWallpaperIfNeeded() {
  ensureDataDir();
  if (fs.existsSync(WALLPAPER_BACKUP_META)) {
    return JSON.parse(fs.readFileSync(WALLPAPER_BACKUP_META, 'utf-8'));
  }
  const currentPath = await getCurrentWindowsWallpaper();
  let backupCopyPath = null;
  if (currentPath && fs.existsSync(currentPath)) {
    const ext = path.extname(currentPath) || '.jpg';
    backupCopyPath = path.join(DATA_DIR, `original-wallpaper-backup${ext}`);
    try {
      fs.copyFileSync(currentPath, backupCopyPath);
    } catch (e) {
      backupCopyPath = currentPath;
    }
  }
  const meta = {
    originalPath: currentPath || '',
    backupCopyPath: backupCopyPath || currentPath || '',
    backedUpAt: Date.now(),
  };
  fs.writeFileSync(WALLPAPER_BACKUP_META, JSON.stringify(meta, null, 2), 'utf-8');
  return meta;
}

async function restoreOriginalWallpaper() {
  ensureDataDir();
  if (!fs.existsSync(WALLPAPER_BACKUP_META)) {
    return { ok: false, reason: 'No wallpaper backup found' };
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
    return { ok: false, reason: 'Original wallpaper file no longer exists' };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

async function listRunningWindowedApps() {
  const psScript = `
Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json -Compress
`;
  const res = await runPowerShell(psScript);
  if (!res.ok || !res.stdout) return [];
  try {
    const parsed = JSON.parse(res.stdout);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

// Default distracting apps that get closed if Process Guard is active and they are not whitelisted
const DEFAULT_DISTRACTING_PROCESSES = [
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

async function enforceProcessWhitelist() {
  if (!isMonkModeLocked || !processGuardEnabled) return;
  const apps = await listRunningWindowedApps();
  const allowedSet = new Set(
    [
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
      ...activeWhitelist.map((s) => s.toLowerCase().replace(/\.exe$/i, '')),
    ]
  );

  for (const proc of apps) {
    const pName = String(proc.ProcessName || '').toLowerCase();
    if (!pName || allowedSet.has(pName)) continue;
    if (DEFAULT_DISTRACTING_PROCESSES.includes(pName)) {
      await runPowerShell(`Stop-Process -Id ${Number(proc.Id)} -Force -ErrorAction SilentlyContinue`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('os:process-blocked', {
          processName: proc.ProcessName,
          title: proc.MainWindowTitle,
          timestamp: Date.now(),
        });
      }
    }
  }
}

function createMainWindow() {
  ensureDataDir();

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 740,
    title: 'LÊN NÚI (ASCEND THE MOUNTAIN) — Hệ Thống Kỷ Luật Tu Luyện',
    backgroundColor: '#121314',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  const distIndex = path.join(__dirname, '..', 'dist', 'index.html');

  if (!app.isPackaged && process.env.USE_DIST !== 'true') {
    mainWindow.loadURL(devServerUrl).catch(() => {
      if (fs.existsSync(distIndex)) {
        mainWindow.loadFile(distIndex);
      }
    });
  } else {
    mainWindow.loadFile(distIndex);
  }

  mainWindow.on('blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:focus-changed', {
        isFocused: false,
        timestamp: Date.now(),
      });
    }
    // If Full-Screen Alarm Hijack is active, immediately reclaim focus
    if (isAlarmHijackActive && mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        if (isAlarmHijackActive && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.setAlwaysOnTop(true, 'screen-saver');
        }
      }, 250);
    }
  });

  mainWindow.on('focus', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window:focus-changed', {
        isFocused: true,
        timestamp: Date.now(),
      });
    }
  });

  mainWindow.on('close', (e) => {
    if (isMonkModeLocked && !devForceQuit) {
      e.preventDefault();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('os:close-blocked', {
        message:
          'GIỚI LUẬT ĐANG KHÓA: Không có cửa thoát hiểm khi đang ở trên Đỉnh Núi (Monk Mode: ON). (Dùng phím khẩn cấp Developer Ctrl+Shift+Alt+M nếu đang kiểm thử).',
      });
    }
  });
}

app.whenReady().then(() => {
  createMainWindow();

  // Developer Emergency Shortcut: Ctrl+Shift+Alt+M
  globalShortcut.register('CommandOrControl+Shift+Alt+M', async () => {
    isMonkModeLocked = false;
    isAlarmHijackActive = false;
    processGuardEnabled = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setFullScreen(false);
      mainWindow.webContents.send('os:dev-emergency-unlock', {
        timestamp: Date.now(),
      });
    }
    await restoreOriginalWallpaper();
  });

  processGuardInterval = setInterval(enforceProcessWhitelist, 5000);
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (processGuardInterval) clearInterval(processGuardInterval);
});

// IPC Handlers: Database Persistence
ipcMain.handle('db:load', async () => {
  ensureDataDir();
  if (!fs.existsSync(DB_PATH)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read DB:', e);
    return null;
  }
});

ipcMain.handle('db:save', async (_event, data) => {
  ensureDataDir();
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
    return { ok: true, path: DB_PATH };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});

// IPC Handlers: Monk Mode & OS Lockdown
ipcMain.handle('os:set-monk-lock', async (_event, payload) => {
  isMonkModeLocked = Boolean(payload?.isMonkModeOn);
  activeWhitelist = Array.isArray(payload?.whitelistedApps) ? payload.whitelistedApps : [];
  processGuardEnabled = Boolean(payload?.processGuardEnabled);
  return {
    ok: true,
    isMonkModeLocked,
    processGuardEnabled,
  };
});

ipcMain.handle('os:set-alarm-hijack', async (_event, active) => {
  isAlarmHijackActive = Boolean(active);
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (isAlarmHijackActive) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.setAlwaysOnTop(true, 'screen-saver');
      mainWindow.setFullScreen(true);
    } else {
      mainWindow.setAlwaysOnTop(false);
      mainWindow.setFullScreen(false);
    }
  }
  return { ok: true, isAlarmHijackActive };
});

ipcMain.handle('os:set-wallpaper-dataurl', async (_event, dataUrl) => {
  ensureDataDir();
  try {
    await backupCurrentWallpaperIfNeeded();
    const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    fs.writeFileSync(ACTIVE_WALLPAPER_PATH, Buffer.from(base64Data, 'base64'));
    const res = await setWindowsWallpaper(ACTIVE_WALLPAPER_PATH);
    return { ok: res.ok, path: ACTIVE_WALLPAPER_PATH };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('os:restore-wallpaper', async () => {
  return await restoreOriginalWallpaper();
});

ipcMain.handle('os:list-running-apps', async () => {
  return await listRunningWindowedApps();
});

ipcMain.handle('os:get-screen-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 1280, height: 720 },
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      dataUrl: s.thumbnail.toDataURL(),
    }));
  } catch (err) {
    return [];
  }
});

ipcMain.handle('os:notify', async (_event, { title, body }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, silent: false });
    n.show();
    n.on('click', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  }
  return { ok: true };
});

ipcMain.handle('os:export-scroll-pdf', async (_event, { htmlContent, defaultFileName }) => {
  ensureDataDir();
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Xuất Bí Kíp Tu Luyện Cổ Thư (PDF)',
    defaultPath: path.join(app.getPath('documents'), defaultFileName || 'Bi-Kip-Tu-Luyen.pdf'),
    filters: [{ name: 'Sacred Scroll PDF', extensions: ['pdf'] }],
  });

  if (canceled || !filePath) {
    return { ok: false, canceled: true };
  }

  const pdfWin = new BrowserWindow({
    width: 900,
    height: 1200,
    show: false,
    webPreferences: {
      contextIsolation: true,
    },
  });

  try {
    const tempHtmlPath = path.join(DATA_DIR, 'temp-scroll-export.html');
    fs.writeFileSync(tempHtmlPath, htmlContent, 'utf-8');
    await pdfWin.loadFile(tempHtmlPath);
    await new Promise((r) => setTimeout(r, 600));
    const pdfBuffer = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    fs.writeFileSync(filePath, pdfBuffer);
    pdfWin.destroy();
    shell.showItemInFolder(filePath);
    return { ok: true, filePath };
  } catch (err) {
    pdfWin.destroy();
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('os:force-quit-dev', async () => {
  devForceQuit = true;
  isMonkModeLocked = false;
  await restoreOriginalWallpaper();
  app.quit();
});
