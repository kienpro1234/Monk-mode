import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { build as viteBuild } from 'vite';

const ROOT = process.cwd();
const LAW_TS_PATH = path.join(ROOT, 'src', 'services', 'mountainLaws.ts');
const LAW_MJS_PATH = path.join(ROOT, 'scripts', 'lawEngine.mjs');
const DIST_DIR = path.join(ROOT, 'dist');

function compileLawEngine() {
  const sourceText = fs.readFileSync(LAW_TS_PATH, 'utf-8');
  const compiled = ts.transpileModule(sourceText, {
    fileName: LAW_TS_PATH,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: false,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });

  const banner = '// AUTO-GENERATED FROM src/services/mountainLaws.ts — DO NOT EDIT DIRECTLY\n';
  fs.writeFileSync(LAW_MJS_PATH, banner + compiled.outputText, 'utf-8');
  console.log('[LÊN NÚI BUILDER] Compiled scripts/lawEngine.mjs from src/services/mountainLaws.ts');
}

async function runBuild() {
  compileLawEngine();
  console.log('[LÊN NÚI BUILDER] Running Vite production build (tree-shaking + minification)...');
  await viteBuild();

  const bundlePath = path.join(DIST_DIR, 'app.bundle.js');
  const cssPath = path.join(DIST_DIR, 'shanshui.css');
  const htmlPath = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(bundlePath) || !fs.existsSync(htmlPath)) {
    throw new Error('Vite build did not emit dist/app.bundle.js or dist/index.html');
  }
  const jsKb = (fs.statSync(bundlePath).size / 1024).toFixed(1);
  const cssKb = fs.existsSync(cssPath) ? (fs.statSync(cssPath).size / 1024).toFixed(1) : '0';
  console.log(
    `[LÊN NÚI BUILDER] Built dist/app.bundle.js (${jsKb} KB), dist/shanshui.css (${cssKb} KB), and dist/index.html successfully!`
  );
}

runBuild().catch((err) => {
  console.error('[LÊN NÚI BUILDER] Build failed:', err);
  process.exit(1);
});
