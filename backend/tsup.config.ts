import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/main.ts', 'seed/run.ts', 'scripts/migrate.ts'],
  format: ['esm'],
  target: 'node22',
  outDir: 'dist',
  clean: true,
  noExternal: ['@thunikart/shared'],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
