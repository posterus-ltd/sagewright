/// <reference types='vitest' />
import { createReadStream, cpSync, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';
import { nxCopyAssetsPlugin } from '@nx/vite/plugins/nx-copy-assets.plugin';

// The demo web component is built separately (control-plane-web:build-demo →
// dist/control-plane-web-demo). This plugin makes the landing serve it under /demo/:
// a dev middleware in `nx serve`, and a recursive copy into the landing output on
// build. Zero extra dependencies. (The landing `build` target dependsOn build-demo so
// the artifact exists — see project.json.)
const DEMO_DIST = join(import.meta.dirname, '../../dist/control-plane-web-demo');

const MIME: Record<string, string> = {
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.map': 'application/json',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

const sagewrightDemoAssets = (): Plugin => ({
  name: 'sagewright-demo-assets',
  apply: () => true,
  configureServer(server) {
    server.middlewares.use('/demo', (req, res, next) => {
      const rel = decodeURIComponent((req.url ?? '/').split('?')[0]!);
      const filePath = join(DEMO_DIST, rel);
      // Guard against path traversal outside the demo dist.
      if (!filePath.startsWith(DEMO_DIST) || !existsSync(filePath) || !statSync(filePath).isFile()) {
        next();
        return;
      }
      res.setHeader('Content-Type', MIME[extname(filePath)] ?? 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-cache');
      createReadStream(filePath).pipe(res);
    });
  },
  closeBundle() {
    if (!existsSync(DEMO_DIST)) {
      this.warn('dist/control-plane-web-demo not found — run control-plane-web:build-demo first');
      return;
    }
    cpSync(DEMO_DIST, join(import.meta.dirname, '../../dist/apps/landing/demo'), { recursive: true });
  },
});

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/landing',
  server: {
    port: 4200,
    host: 'localhost',
  },
  preview: {
    port: 4200,
    host: 'localhost',
  },
  plugins: [react(), nxViteTsPaths(), nxCopyAssetsPlugin(['*.md']), sagewrightDemoAssets()],
  // Uncomment this if you are using runners.
  // runner: {
  //   plugins: () => [ nxViteTsPaths() ],
  // },
  build: {
    outDir: '../../dist/apps/landing',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    name: 'landing',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/landing',
      provider: 'v8' as const,
    },
  },
}));
