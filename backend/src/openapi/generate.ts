import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../app';
import { buildOpenApi } from './builder';

// Importing the app registers every route, so the spec always matches the code.
await buildApp({ logger: false });
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/api/openapi.json');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(buildOpenApi(), null, 2) + '\n');
console.log(`Wrote ${out}`);
process.exit(0);
