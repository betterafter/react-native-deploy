#!/usr/bin/env node
/**
 * Runs after `npm i -D github:betterafter/react-native-deploy`.
 * Scaffolds rnd.config.json in the *consumer* app root (INIT_CWD).
 *
 * Package managers that skip dependency build scripts (pnpm, or any install
 * with --ignore-scripts) never reach this file; `npx rnd init` does the same
 * work on demand. Nothing here may fail the install.
 */
import { resolveConsumerRoot, scaffoldRndConfig } from './init-config.js';

try {
  const cwd = resolveConsumerRoot();
  const result = scaffoldRndConfig({ cwd });

  if (result.created) {
    process.stdout.write(
      `[rnd] Created ${result.path}\n` +
        `[rnd] Next (3 commands):\n` +
        `  npx rnd token add\n` +
        `  npx rnd build\n` +
        `  npx rnd deploy -m "메모"\n` +
        `[rnd] Default deploy = install QR (APK) + sandbox QR (Expo export)\n`,
    );
  } else if (
    result.skipped &&
    result.reason &&
    !result.reason.includes('already exists')
  ) {
    // Quiet when already configured; only note real skips (e.g. no package.json).
    process.stdout.write(`[rnd] postinstall skipped: ${result.reason}\n`);
  }
} catch (err) {
  process.stdout.write(
    `[rnd] postinstall skipped: ${err instanceof Error ? err.message : err}\n` +
      `[rnd] Run \`npx rnd init\` to create rnd.config.json.\n`,
  );
}
