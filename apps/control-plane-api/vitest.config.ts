import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { globals: true, environment: 'node' },
  resolve: {
    alias: {
      '@sagewright/shared': path.resolve(__dirname, '../../libs/shared/src/index.ts'),
    },
  },
});
