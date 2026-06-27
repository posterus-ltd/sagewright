/// <reference types='vitest' />
import { join } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import license from 'rollup-plugin-license';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/control-plane-web',
  server:{
    port: 4200,
    host: 'localhost',
    // Proxy API + WebSocket (terminal) to the control-plane in dev.
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true, ws: true },
      '/internal': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  preview:{
    port: 4200,
    host: 'localhost',
  },
  plugins: [
    react(),
    nxViteTsPaths(),
    nxCopyAssetsPlugin(['*.md']),
    // Emit a third-party license notice for every dependency bundled into the
    // client (i.e. runtime deps). Build-only: it sits at the dist root and is
    // served at /3rd-party-attribution.txt.
    {
      ...license({
        // Vite sets cwd to the app dir, which has no package.json; point the
        // plugin at the workspace root so it can resolve dependency metadata.
        cwd: join(import.meta.dirname, '../..'),
        thirdParty: {
          includePrivate: false,
          output: {
            file: join(import.meta.dirname, '../../dist/control-plane-web/3rd-party-attribution.txt'),
          },
        },
      }),
      apply: 'build',
    },
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //   plugins: () => [ nxViteTsPaths() ],
  // },
  build: {
    outDir: '../../dist/control-plane-web',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: 'control-plane-web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../coverage/control-plane-web',
      provider: 'v8' as const,
    }
  },
}));
