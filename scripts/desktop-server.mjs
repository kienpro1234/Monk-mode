import http from 'http';
import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';

const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');
const DATA_DIR = path.join(ROOT, 'data');
const PROFILE_DIR = path.join(DATA_DIR, 'desktop-window-profile');
const DB_PATH = path.join(DATA_DIR, 'len-nui-db.json');
const WALLPAPER_BACKUP_META = path.join(DATA_DIR, 'wallpaper-backup.json');
const ACTIVE_WALLPAPER_PATH = path.join(DATA_DIR, 'monk-active-wallpaper.png');
const SCREEN_CAPTURE_PATH = path.join(DATA_DIR, 'live-screen-capture.png');
const PREFERRED_PORT = Number(process.env.PORT || 5173);

let isMonkModeLocked = false;
let isAlarmHijackActive = false;
let processGuardEnabled = false;
let activeWhitelist = [];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
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
  fs.writeFileSync(WALLPAPER_BACKUP_META, JSON.stringify(meta, null, 2), 'utf-8');
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
  const ps = `Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json -Compress`;
  const out = await runPowerShell(ps);
  if (!out.ok || !out.stdout) return;
  let apps = [];
  try {
    const parsed = JSON.parse(out.stdout);
    apps = Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return;
  }

  const allowedSet = new Set([
    'chrome',
    'msedge',
    'explorer',
    'powershell',
    'pwsh',
    'cmd',
    'code',
    ...activeWhitelist.map((s) => String(s).toLowerCase().replace(/\.exe$/i, '')),
  ]);

  for (const proc of apps) {
    const pName = String(proc.ProcessName || '').toLowerCase();
    if (!pName || allowedSet.has(pName)) continue;
    if (DEFAULT_DISTRACTING_PROCESSES.includes(pName)) {
      await runPowerShell(`Stop-Process -Id ${Number(proc.Id)} -Force -ErrorAction SilentlyContinue`);
    }
  }
}

setInterval(enforceProcessWhitelist, 5000);

function readJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
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
  const urlObj = new URL(req.url || '/', `http://127.0.0.1:${PREFERRED_PORT}`);
  const pathname = urlObj.pathname;

  if (pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (pathname === '/api/db' && req.method === 'GET') {
      ensureDataDir();
      if (!fs.existsSync(DB_PATH)) {
        res.end(JSON.stringify({ data: null }));
        return;
      }
      try {
        const raw = fs.readFileSync(DB_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        isMonkModeLocked = Boolean(parsed?.session?.isMonkModeOn);
        res.end(JSON.stringify({ data: parsed }));
      } catch {
        res.end(JSON.stringify({ data: null }));
      }
      return;
    }

    if (pathname === '/api/db' && req.method === 'POST') {
      ensureDataDir();
      const body = await readJsonBody(req);
      if (body?.data) {
        isMonkModeLocked = Boolean(body.data?.session?.isMonkModeOn);
        fs.writeFileSync(DB_PATH, JSON.stringify(body.data, null, 2), 'utf-8');
      }
      res.end(JSON.stringify({ ok: true, path: DB_PATH }));
      return;
    }

    if (pathname === '/api/os/monk-lock' && req.method === 'POST') {
      const body = await readJsonBody(req);
      isMonkModeLocked = Boolean(body?.isMonkModeOn);
      processGuardEnabled = Boolean(body?.processGuardEnabled);
      activeWhitelist = Array.isArray(body?.whitelistedApps) ? body.whitelistedApps : [];
      res.end(JSON.stringify({ ok: true, isMonkModeLocked }));
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

    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const relPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.join(DIST_DIR, relPath);
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

function launchDesktopWindow(url) {
  if (process.env.NO_WINDOW === 'true') return;
  ensureDataDir();

  const freshUrl = `${url}/?t=${Date.now()}`;
  const hostExe = findNativeAppHostExecutable();
  if (hostExe) {
    console.log(`[LÊN NÚI DESKTOP] Đang mở cửa sổ Desktop App tại: ${freshUrl}`);
    const child = spawn(
      hostExe,
      [
        `--app=${freshUrl}`,
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

  runPowerShell(`Start-Process "${freshUrl}"`);
}

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.log(`[LÊN NÚI DESKTOP] Cổng ${PREFERRED_PORT} đang được sử dụng, chuyển sang cổng tự động...`);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = typeof addr === 'object' && addr ? addr.port : PREFERRED_PORT;
      const url = `http://127.0.0.1:${port}`;
      console.log(`[LÊN NÚI DESKTOP] Server đang chạy tại ${url}`);
      launchDesktopWindow(url);
    });
  } else {
    console.error('[LÊN NÚI DESKTOP] Server error:', err);
  }
});

server.listen(PREFERRED_PORT, '127.0.0.1', () => {
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : PREFERRED_PORT;
  const url = `http://127.0.0.1:${port}`;
  console.log(`[LÊN NÚI DESKTOP] Server & Windows OS Engine đang chạy tại ${url}`);
  console.log(`[LÊN NÚI DESKTOP] Giữ cửa sổ này (hoặc thu nhỏ xuống thanh Taskbar) trong lúc sử dụng App.`);
  launchDesktopWindow(url);
});
