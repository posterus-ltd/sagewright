import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'control-plane-web',
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
  },
  resolve: {
    alias: {
      '@sagewright/shared': path.resolve(__dirname, '../../libs/shared/src/index.ts'),
    },
  },
});
