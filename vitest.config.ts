import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    restoreMocks: true,
    unstubGlobals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/{main,preload,shared,setup}/**/*.test.ts'],
          setupFiles: ['tests/setup/no-network.ts'],
        },
      },
      {
        extends: true,
        plugins: [react()],
        test: {
          name: 'renderer',
          environment: 'jsdom',
          include: ['tests/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['tests/setup/no-network.ts', 'tests/setup/renderer.ts'],
        },
      },
    ],
  },
});
