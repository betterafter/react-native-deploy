#!/usr/bin/env node
import {
  resolveConsumerRoot,
  scaffoldRndConfig
} from "./chunk-OWPRZIS6.js";

// src/postinstall.ts
var cwd = resolveConsumerRoot();
var result = scaffoldRndConfig({ cwd });
if (result.created) {
  process.stdout.write(
    `[rnd] Created ${result.path}
[rnd] Next (4 commands):
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
