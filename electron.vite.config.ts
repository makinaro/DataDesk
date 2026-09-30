import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'electron-vite';

const root = import.meta.dirname;

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(root, 'src/main/index.ts'),
          // datadesk-mcp: a separate process entry (see src/mcp-server/index.ts).
          'mcp-server': resolve(root, 'src/mcp-server/index.ts'),
        },
      },
    },
  },
  preload: {
    build: {
      // Sandboxed preloads can only require('electron') and a few built-ins, so every
      // dependency must be bundled in, and the output must be CommonJS (package is "type": "module").
      externalizeDeps: false,
      rollupOptions: {
        input: { index: resolve(root, 'src/preload/index.ts') },
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },
  renderer: {
    root: resolve(root, 'src/renderer'),
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: { index: resolve(root, 'src/renderer/index.html') },
      },
    },
  },
});
