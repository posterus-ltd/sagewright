import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

await Promise.all([
  build({
    entryPoints: [resolve(__dirname, 'src/main.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: resolve(__dirname, 'dist/main.js'),
    packages: 'external',
    alias: {
      '@sagewright/shared': resolve(root, 'libs/shared/src/index.ts'),
    },
    external: ['pg', 'dockerode', 'fastify', '@fastify/*', 'drizzle-orm', 'zod', 'node:*'],
  }),
  build({
    entryPoints: [resolve(__dirname, 'src/db/migrate.ts')],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    outfile: resolve(__dirname, 'dist/db/migrate.js'),
    packages: 'external',
    alias: {
      '@sagewright/shared': resolve(root, 'libs/shared/src/index.ts'),
    },
    external: ['pg', 'drizzle-orm', 'zod', 'node:*'],
  }),
]);

console.log('control-plane-api built: dist/main.js + dist/db/migrate.js');
