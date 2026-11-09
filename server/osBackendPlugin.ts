import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import type { Plugin } from 'vite';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'len-nui-db.json');
const WALLPAPER_BACKUP_META = path.join(DATA_DIR, 'wallpaper-backup.json');
const ACTIVE_WALLPAPER_PATH = path.join(DATA_DIR, 'monk-active-wallpaper.png');
const SCREEN_CAPTURE_PATH = path.join(DATA_DIR, 'live-screen-capture.png');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function runPowerShell(script: string): Promise<{ ok: boolean; stdout: string; stderr: string }> {
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

async function setWindowsWallpaper(imagePath: string) {
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
  let backupCopyPath: string | null = null;
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
    return { ok: false, reason: 'Original wallpaper file not found' };
  } catch (err) {
    return { ok: false, reason: String(err) };
  }
}

async function captureDesktopScreenViaPS(): Promise<string | null> {
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

function readJsonBody(req: any): Promise<any> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: any) => {
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

export function osBackendPlugin(): Plugin {
  return {
    name: 'monk-os-backend',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();

        res.setHeader('Content-Type', 'application/json; charset=utf-8');

        if (req.url === '/api/db' && req.method === 'GET') {
          ensureDataDir();
          if (!fs.existsSync(DB_PATH)) {
            res.end(JSON.stringify({ data: null }));
            return;
          }
          try {
            const raw = fs.readFileSync(DB_PATH, 'utf-8');
            res.end(JSON.stringify({ data: JSON.parse(raw) }));
          } catch {
            res.end(JSON.stringify({ data: null }));
          }
          return;
        }

        if (req.url === '/api/db' && req.method === 'POST') {
          ensureDataDir();
          const body = await readJsonBody(req);
          fs.writeFileSync(DB_PATH, JSON.stringify(body.data, null, 2), 'utf-8');
          res.end(JSON.stringify({ ok: true, path: DB_PATH }));
          return;
        }

        if (req.url === '/api/os/running-apps' && req.method === 'GET') {
          const ps = `Get-Process | Where-Object { $_.MainWindowTitle -ne "" } | Select-Object Id, ProcessName, MainWindowTitle | ConvertTo-Json -Compress`;
          const out = await runPowerShell(ps);
          let apps: any[] = [];
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

        if (req.url === '/api/os/set-wallpaper' && req.method === 'POST') {
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

        if (req.url === '/api/os/restore-wallpaper' && req.method === 'POST') {
          const r = await restoreOriginalWallpaper();
          res.end(JSON.stringify(r));
          return;
        }

        if (req.url === '/api/os/capture-screen' && req.method === 'GET') {
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

        next();
      });
    },
  };
}
