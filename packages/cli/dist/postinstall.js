#!/usr/bin/env node
import {
  resolveConsumerRoot,
  scaffoldRndConfig
} from "./chunk-KWNOYSDW.js";

// src/postinstall.ts
var cwd = resolveConsumerRoot();
var result = scaffoldRndConfig({ cwd });
if (result.created) {
  process.stdout.write(
    `[rnd] Created ${result.path}
[rnd] Next:
  1. Edit apiUrl (and artifact paths if needed) in rnd.config.json
  2. npx rnd token add
  3. npm run build   # or your IPA/APK / expo flow
  4. npx rnd deploy -m "\uBA54\uBAA8"
`
  );
} else if (result.skipped && result.reason && !result.reason.includes("already exists")) {
  process.stdout.write(`[rnd] postinstall skipped: ${result.reason}
`);
}
