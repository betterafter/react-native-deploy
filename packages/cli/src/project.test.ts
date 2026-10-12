import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeSatisfies, resolveProject } from './project.js';

const root = mkdtempSync(join(tmpdir(), 'rnd-project-'));
mkdirSync(join(root, 'apps/mobile'), { recursive: true });
mkdirSync(join(root, 'apps/miniapp'), { recursive: true });
mkdirSync(join(root, 'app/src'), { recursive: true });

writeFileSync(
  join(root, 'package.json'),
  JSON.stringify({
    name: 'mono',
    packageManager: 'pnpm@11.19.0',
    engines: { node: '>=22.13.0' },
  }),
);
writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*\n');
writeFileSync(join(root, 'rnd.config.json'), JSON.stringify({ appId: 'mono', apiUrl: 'https://example.test' }));
writeFileSync(
  join(root, 'apps/mobile/package.json'),
  JSON.stringify({ name: 'mobile', dependencies: { expo: '^57.0.0', 'react-native': '0.86.3' } }),
);
writeFileSync(
  join(root, 'apps/miniapp/package.json'),
  JSON.stringify({ name: 'miniapp', dependencies: { 'react-native': '0.84.0' } }),
);
writeFileSync(join(root, 'app/build.gradle.kts'), 'plugins {}\n');

const found = resolveProject(root);
assert.equal(found.appDir, join(root, 'apps/mobile'));
assert.equal(found.packageManager, 'pnpm');
assert.equal(found.hasExpo, true);

const explicit = resolveProject(root, { appDir: join(root, 'apps/miniapp') });
assert.equal(explicit.appDir, join(root, 'apps/miniapp'));
assert.equal(explicit.hasExpo, false);

assert.equal(nodeSatisfies('22.19.0', '>=22.13.0'), true);
assert.equal(nodeSatisfies('20.20.0', '>=22.13.0'), false);
assert.equal(nodeSatisfies('22.13.0', '^22.0.0'), true);
assert.equal(nodeSatisfies('23.0.0', '^22.0.0'), false);

const real = resolveProject('/Users/singiyeol/100million');
assert.equal(real.appDir, '/Users/singiyeol/100million/apps/mobile');
assert.equal(real.packageManager, 'pnpm');
assert.equal(real.hasExpo, true);

console.log('project resolution ok');
