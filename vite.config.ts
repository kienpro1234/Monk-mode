import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

function monkClassicBundlePlugin(): Plugin {
  return {
    name: 'monk-classic-bundle',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const item of Object.values(bundle)) {
        if (item.type === 'asset' && item.fileName.endsWith('.css') && typeof item.source === 'string') {
          item.source = item.source
            .replace(/url\((["']?)\/assets\//g, "url($1./assets/")
            .replace(/url\(\.\/assets\//g, "url('./assets/");
        }
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const ver = Date.now();
        return html
          .replace(
            /<script[^>]*type=["']module["'][^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
            (_m, src) => `<script defer src="${src}?v=${ver}"></script>`
          )
          .replace(
            /<link\s+([^>]*?)rel=["']stylesheet["']([^>]*?)href=["']([^"']+)["']([^>]*)>/gi,
            (_m, a, b, href, c) =>
              `<link ${a}rel="stylesheet"${b}href="${href}?v=${ver}"${c}>`.replace(/\s+crossorigin(?:=["'][^"']*["'])?/gi, '')
          );
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), monkClassicBundlePlugin()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:5173',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.bundle.js',
        assetFileNames: (assetInfo) =>
          assetInfo.name && assetInfo.name.endsWith('.css')
            ? 'shanshui.css'
            : 'assets/[name][extname]',
      },
    },
  },
});
