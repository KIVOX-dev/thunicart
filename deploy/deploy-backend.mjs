#!/usr/bin/env node
// Deploys the backend to Zoho Catalyst AppSail with the Catalyst CLI.
//   node deploy/deploy-backend.mjs docker   -> deploys the CI-built Docker image (preferred)
//   node deploy/deploy-backend.mjs managed  -> deploys the bundled code on the managed node24 runtime
// Secrets are never in the repo. Set them in the Catalyst console (Docker path) or export them in CI.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const mode = process.argv[2] ?? 'docker';
const NAME = process.env.APPSAIL_NAME ?? 'thunikart-api';
const root = resolve(import.meta.dirname, '..');
const run = (cmd, args, opts = {}) => {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', cwd: root, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
};

if (mode === 'docker') {
  const tag = process.env.IMAGE_TAG ?? 'thunikart-backend:latest';
  run('docker', ['build', '--platform', 'linux/amd64', '-f', 'backend/Dockerfile', '--target', 'runtime', '-t', tag, '.']);
  run('catalyst', ['deploy', 'appsail', '--name', NAME, '--source', `docker://${tag}`, '--port', '9000', '-ni']);
} else if (mode === 'managed') {
  run('pnpm', ['--filter', '@thunikart/backend', 'build']);
  const out = resolve(root, 'backend/dist-appsail');
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(resolve(root, 'backend/dist'), resolve(out, 'dist'), { recursive: true });
  writeFileSync(resolve(out, 'package.json'), JSON.stringify({
    name: 'thunikart-api', private: true, type: 'module',
    dependencies: JSON.parse((await import('node:fs')).readFileSync(resolve(root, 'backend/package.json'), 'utf8')).dependencies,
  }));
  // AppSail installs dependencies from package.json. @thunikart/shared is bundled into dist by tsup.
  const pkg = JSON.parse((await import('node:fs')).readFileSync(resolve(out, 'package.json'), 'utf8'));
  delete pkg.dependencies['@thunikart/shared'];
  writeFileSync(resolve(out, 'package.json'), JSON.stringify(pkg, null, 2));
  run('catalyst', ['deploy', 'appsail', '--name', NAME, '--build-path', out, '--stack', 'node24', '--command', 'node dist/src/main.js', '-ni']);
} else {
  console.error('Usage: deploy-backend.mjs [docker|managed]');
  process.exit(1);
}
