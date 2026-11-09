import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const DIST_DIR = path.join(ROOT, 'dist');
const PUBLIC_ASSETS = path.join(ROOT, 'public', 'assets');
const DIST_ASSETS = path.join(DIST_DIR, 'assets');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function walkTsFiles(dir, fileList = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkTsFiles(full, fileList);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      fileList.push(full);
    }
  }
  return fileList;
}

function normalizeModuleId(relPath) {
  return relPath
    .replace(/\\/g, '/')
    .replace(/\.(ts|tsx|js|jsx)$/, '');
}

console.log('[LÊN NÚI BUILDER] Compiling TypeScript & React modules...');
ensureDir(DIST_DIR);
ensureDir(DIST_ASSETS);

// Copy public assets
if (fs.existsSync(PUBLIC_ASSETS)) {
  for (const file of fs.readdirSync(PUBLIC_ASSETS)) {
    fs.copyFileSync(path.join(PUBLIC_ASSETS, file), path.join(DIST_ASSETS, file));
  }
}

// Copy CSS
const cssPath = path.join(SRC_DIR, 'styles', 'shanshui.css');
if (fs.existsSync(cssPath)) {
  fs.copyFileSync(cssPath, path.join(DIST_DIR, 'shanshui.css'));
}

// Transpile all src files
const tsFiles = walkTsFiles(SRC_DIR);
const moduleDefinitions = [];

for (const filePath of tsFiles) {
  const relFromSrc = path.relative(SRC_DIR, filePath);
  const modId = './' + normalizeModuleId(relFromSrc);
  const sourceText = fs.readFileSync(filePath, 'utf-8').replace(/import\s+['"].*\.css['"];?/g, '');

  const result = ts.transpileModule(sourceText, {
    fileName: filePath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
  });

  moduleDefinitions.push({
    id: modId,
    code: result.outputText,
  });
}

const reactUmd = fs.readFileSync(
  path.join(ROOT, 'node_modules', 'react', 'umd', 'react.production.min.js'),
  'utf-8'
);
const reactDomUmd = fs.readFileSync(
  path.join(ROOT, 'node_modules', 'react-dom', 'umd', 'react-dom.production.min.js'),
  'utf-8'
);
const lucideCjs = fs.readFileSync(
  path.join(ROOT, 'node_modules', 'lucide-react', 'dist', 'cjs', 'lucide-react.js'),
  'utf-8'
);

let bundleOut = `/* LÊN NÚI (ASCEND THE MOUNTAIN) — Desktop Bundle */\n`;
bundleOut += `${reactUmd}\n`;
bundleOut += `${reactDomUmd}\n`;
bundleOut += `(function() {\n`;
bundleOut += `  const __modules = {};\n`;
bundleOut += `  const __cache = {};\n`;
bundleOut += `  __modules['react'] = function(module, exports) { module.exports = window.React; };\n`;
bundleOut += `  __modules['react-dom'] = function(module, exports) { module.exports = window.ReactDOM; };\n`;
bundleOut += `  __modules['react-dom/client'] = function(module, exports) { module.exports = window.ReactDOM; };\n`;
bundleOut += `  __modules['lucide-react'] = function(module, exports, require) {\n${lucideCjs}\n  };\n`;

for (const mod of moduleDefinitions) {
  bundleOut += `  __modules[${JSON.stringify(mod.id)}] = function(module, exports, require) {\n${mod.code}\n  };\n`;
}

bundleOut += `
  function resolvePath(baseId, req) {
    if (!req.startsWith('.')) return req;
    const baseParts = baseId.split('/').slice(0, -1);
    const reqParts = req.replace(/\\.(ts|tsx|js|jsx)$/, '').split('/');
    for (const part of reqParts) {
      if (part === '.' || part === '') continue;
      if (part === '..') baseParts.pop();
      else baseParts.push(part);
    }
    return './' + baseParts.filter((p) => p !== '.' && p !== '').join('/');
  }

  function makeRequire(currentId) {
    return function(req) {
      const resolved = resolvePath(currentId, req);
      if (__cache[resolved]) return __cache[resolved].exports;
      const factory = __modules[resolved];
      if (!factory) {
        throw new Error('Cannot find module: ' + req + ' (resolved: ' + resolved + ' from ' + currentId + ')');
      }
      const mod = { exports: {} };
      __cache[resolved] = mod;
      factory(mod, mod.exports, makeRequire(resolved));
      return mod.exports;
    };
  }

  window.addEventListener('DOMContentLoaded', function() {
    makeRequire('./index')('./main');
  });
})();\n`;

fs.writeFileSync(path.join(DIST_DIR, 'app.bundle.js'), bundleOut, 'utf-8');

const buildVer = Date.now();
const htmlOut = `<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>LÊN NÚI (ASCEND THE MOUNTAIN) — Hệ Thống Tu Luyện & Kỷ Luật Cực Đoan</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;0,700;1,400;1,600&family=Noto+Serif:ital,wght@0,400;0,500;0,600;0,700;1,400&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="./shanshui.css?v=${buildVer}" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./app.bundle.js?v=${buildVer}"></script>
  </body>
</html>`;

fs.writeFileSync(path.join(DIST_DIR, 'index.html'), htmlOut, 'utf-8');
console.log('[LÊN NÚI BUILDER] Built dist/app.bundle.js and dist/index.html successfully!');
