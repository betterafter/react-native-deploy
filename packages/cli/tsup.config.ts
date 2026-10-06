import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/bin.ts'],
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  dts: false,
  target: 'node20',
  // Leave commander external — root package.json depends on it for git installs.
  external: ['commander'],
});
