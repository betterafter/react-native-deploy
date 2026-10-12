#!/usr/bin/env node
import {
  resolveConsumerRoot,
  scaffoldRndConfig
} from "./chunk-GYYLW5XO.js";

// src/postinstall.ts
try {
  const cwd = resolveConsumerRoot();
  const result = scaffoldRndConfig({ cwd });
  if (result.created) {
    process.stdout.write(
      `[rnd] Created ${result.path}
[rnd] Next (3 commands):
  npx rnd token add
  npx rnd build
  npx rnd deploy -m "\uBA54\uBAA8"
[rnd] Default deploy = install QR (APK) + sandbox QR (Expo export)
`
    );
  } else if (result.skipped && result.reason && !result.reason.includes("already exists")) {
    process.stdout.write(`[rnd] postinstall skipped: ${result.reason}
`);
  }
} catch (err) {
  process.stdout.write(
    `[rnd] postinstall skipped: ${err instanceof Error ? err.message : err}
[rnd] Run \`npx rnd init\` to create rnd.config.json.
`
  );
}
