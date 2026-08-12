/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nxViteTsPaths } from '@nx/vite/plugins/nx-tsconfig-paths.plugin';

// Second build target: package the control plane, in demo mode, as a single
// self-contained Web Component (`<sagewright-demo>`) for embedding in the landing
// site. The entry (src/demo/demo-element.tsx) wraps the app in a DemoModeProvider and
// injects the in-memory mock clients (see src/demo/*), then mounts it into a shadow
// root. Deliberately no VitePWA (never register a service worker on the host origin)
// and no license-file emit — this is a lib build, not the app shell.
export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/control-plane-web-demo',
  // Relative base so the ES module's lazy chunks resolve wherever the bundle is
  // served from on the host (the landing serves it under /demo/).
  base: './',
  define: {
    // The demo is read-only: hide the permanent-delete action.
    'import.meta.env.VITE_ALLOW_SESSION_DELETION': JSON.stringify('false'),
    // Library mode (unlike the app build) does NOT auto-replace this, and React reads
    // it at runtime — without this the bundle throws "process is not defined".
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  plugins: [react(), nxViteTsPaths()],
  build: {
    outDir: '../../dist/control-plane-web-demo',
    emptyOutDir: true,
    reportCompressedSize: true,
    // One CSS file rather than per-chunk; the demo injects the terminal CSS it needs
    // into its shadow root at runtime (this emitted file is inert).
    cssCodeSplit: false,
    chunkSizeWarningLimit: 4000,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    lib: {
      entry: 'src/demo/demo-element.tsx',
      // ES only — any umd/iife format forces Rollup's inlineDynamicImports, which
      // would collapse the lazy three.js / @xyflow/react route chunks back into the
      // initial bundle. Keeping ['es'] preserves on-demand loading of the heavy views.
      formats: ['es'],
      fileName: () => 'sagewright-demo.js',
    },
    rollupOptions: {
      // React/ReactDOM are bundled (not externalized) so the widget is fully
      // self-contained and doesn't depend on the host page providing React.
      output: {
        entryFileNames: 'sagewright-demo.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
}));
