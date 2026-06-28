#!/usr/bin/env node
// Dev loop for the control plane.
//
// Watches the control-plane source (api + web + shared lib + build inputs) and,
// on any change, rebuilds the Docker image and recreates the `control-plane`
// container — the exact same path as start.sh / production, so what you see is
// what ships. Changes are debounced and serialized: edits that land mid-build
// queue exactly one follow-up rebuild.
//
//   node scripts/dev-control-plane.mjs   (or: npm run dev:control-plane)
//
// Notes:
// - Worker images are NOT rebuilt here (they're spawned on demand, not part of
//   the control plane). Run ./start.sh or `docker compose --profile build build`
//   when you change anything under workers/.
// - The first run rebuilds once so the container reflects your current tree,
//   then it watches. Ctrl-C to stop.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Source trees + build inputs that affect the control-plane image. A change to
// any of these should trigger a rebuild.
const WATCH = [
  'apps/control-plane-api/src',
  'apps/control-plane-api/drizzle',
  'apps/control-plane-api/Dockerfile',
  'apps/control-plane-api/esbuild.config.mjs',
  'apps/control-plane-web/src',
  'apps/control-plane-web/index.html',
  'apps/control-plane-web/public',
  'libs/shared/src',
  'docker-compose.yml',
  'package.json',
  'package-lock.json',
];

// Paths whose events we ignore even if they bubble up from a watched root.
const IGNORE = /(^|\/)(node_modules|dist|\.git|\.nx)(\/|$)/;

const DEBOUNCE_MS = 400;

const REBUILD_CMD = 'docker';
const REBUILD_ARGS = ['compose', 'up', '--build', '-d', 'control-plane'];

let building = false;
let pending = false;
let debounce = null;

const ts = () => new Date().toTimeString().slice(0, 8);
const log = (msg) => console.log(`\x1b[36m[dev ${ts()}]\x1b[0m ${msg}`);

function rebuild() {
  if (building) {
    pending = true;
    return;
  }
  building = true;
  const startedAt = Date.now();
  log('rebuilding control-plane image…');
  const child = spawn(REBUILD_CMD, REBUILD_ARGS, { cwd: root, stdio: 'inherit' });
  child.on('exit', (code) => {
    building = false;
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    if (code === 0) {
      log(`\x1b[32mredeployed in ${secs}s\x1b[0m — watching for changes…`);
    } else {
      log(`\x1b[31mrebuild failed (exit ${code}) after ${secs}s\x1b[0m — fix and save to retry.`);
    }
    if (pending) {
      pending = false;
      rebuild();
    }
  });
  child.on('error', (err) => {
    building = false;
    log(`\x1b[31mfailed to launch docker: ${err.message}\x1b[0m`);
  });
}

function scheduleRebuild(reason) {
  log(`change: ${reason}`);
  clearTimeout(debounce);
  debounce = setTimeout(rebuild, DEBOUNCE_MS);
}

function watch(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return;
  const isDir = fs.statSync(abs).isDirectory();
  const opts = isDir ? { recursive: true } : {};
  try {
    fs.watch(abs, opts, (_event, filename) => {
      const changed = filename ? path.join(rel, filename) : rel;
      if (IGNORE.test(changed)) return;
      scheduleRebuild(changed);
    });
  } catch (err) {
    log(`\x1b[33mcould not watch ${rel}: ${err.message}\x1b[0m`);
  }
}

process.on('SIGINT', () => {
  log('stopping watcher. The control-plane container keeps running.');
  process.exit(0);
});

log('Sagewright control-plane dev loop');
WATCH.forEach(watch);
log(`watching ${WATCH.length} paths. Initial build first…`);
rebuild();
