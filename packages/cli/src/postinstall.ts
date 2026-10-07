#!/usr/bin/env node
/**
 * Runs after `npm i -D github:betterafter/react-native-deploy`.
 * Scaffolds rnd.config.json in the *consumer* app root (INIT_CWD).
 */
import { resolveConsumerRoot, scaffoldRndConfig } from './init-config.js';

const cwd = resolveConsumerRoot();
const result = scaffoldRndConfig({ cwd });

if (result.created) {
  process.stdout.write(
    `[rnd] Created ${result.path}\n` +
      `[rnd] Next:\n` +
      `  1. Edit apiUrl (and artifact paths if needed) in rnd.config.json\n` +
      `  2. npx rnd token add\n` +
      `  3. npm run build   # or your IPA/APK / expo flow\n` +
      `  4. npx rnd deploy -m "메모"\n`,
  );
} else if (result.skipped && result.reason && !result.reason.includes('already exists')) {
  // Quiet when already configured; only note real skips (e.g. no package.json).
  process.stdout.write(`[rnd] postinstall skipped: ${result.reason}\n`);
}
