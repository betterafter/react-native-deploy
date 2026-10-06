#!/usr/bin/env node

// src/bin.ts
import { Command } from "commander";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { existsSync as existsSync2, readFileSync as readFileSync2, statSync } from "fs";
import { basename, extname, resolve } from "path";

// src/credentials.ts
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
var DIR = join(homedir(), ".rnd");
var FILE = join(DIR, "credentials");
function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 448 });
}
function credentialsPath() {
  return FILE;
}
function loadCredentials() {
  if (!existsSync(FILE)) return {};
  try {
    const raw = JSON.parse(readFileSync(FILE, "utf8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}
function saveCredentials(data) {
  ensureDir();
  writeFileSync(FILE, `${JSON.stringify(data, null, 2)}
`, { mode: 384 });
  try {
    chmodSync(FILE, 384);
  } catch {
  }
}
function addToken(profile, token) {
  const data = loadCredentials();
  data[profile] = token.trim();
  saveCredentials(data);
}
function removeToken(profile) {
  const data = loadCredentials();
  if (!(profile in data)) return false;
  delete data[profile];
  saveCredentials(data);
  return true;
}
function resolveToken(opts) {
  if (opts.token?.trim()) return opts.token.trim();
  if (process.env.RND_API_TOKEN?.trim()) return process.env.RND_API_TOKEN.trim();
  const profile = opts.profile || process.env.RND_PROFILE || "default";
  const data = loadCredentials();
  const fromFile = data[profile];
  if (fromFile?.trim()) return fromFile.trim();
  throw new Error(
    `No API token. Run:
  npx rnd token add
or set RND_API_TOKEN / pass --token.
(looked for profile "${profile}" in ${FILE})`
  );
}

// src/bin.ts
function env(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v == null || v === "") {
    throw new Error(`Missing ${name}. Set env or rnd.config.json / CLI flag.`);
  }
  return v;
}
function loadConfig() {
  const path = resolve(process.cwd(), "rnd.config.json");
  if (!existsSync2(path)) return {};
  try {
    return JSON.parse(readFileSync2(path, "utf8"));
  } catch {
    throw new Error(`Invalid rnd.config.json at ${path}`);
  }
}
function detectPlatform(file, explicit) {
  if (explicit === "ios" || explicit === "android") return explicit;
  const ext = extname(file).toLowerCase();
  if (ext === ".ipa") return "ios";
  if (ext === ".apk" || ext === ".aab") return "android";
  throw new Error("Cannot detect platform. Pass --platform ios|android");
}
function defaultVersion() {
  const d = /* @__PURE__ */ new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const n = String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0");
  return `${y}${m}${day}-${n}`;
}
async function api(baseUrl, token, path, init) {
  return fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init?.headers ?? {}
    }
  });
}
async function deployFile(opts) {
  const filePath = resolve(opts.file);
  if (!existsSync2(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const platform = detectPlatform(filePath, opts.platform);
  const version = opts.version ?? defaultVersion();
  const memo = opts.memo ?? "";
  const fileName = basename(filePath);
  const fileSize = statSync(filePath).size;
  const bytes = readFileSync2(filePath);
  process.stdout.write(`Deploying ${fileName} (${platform}) as ${version}\u2026
`);
  const contentType = platform === "ios" ? "application/octet-stream" : fileName.endsWith(".aab") ? "application/octet-stream" : "application/vnd.android.package-archive";
  const presignRes = await api(opts.apiUrl, opts.token, "/api/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appId: opts.appId,
      platform,
      version,
      fileName,
      contentType
    })
  });
  if (!presignRes.ok) {
    throw new Error(`presign failed: ${presignRes.status} ${await presignRes.text()}`);
  }
  const presign = await presignRes.json();
  const put = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(fileSize)
    },
    body: bytes
  });
  if (!put.ok) {
    throw new Error(`upload failed: ${put.status} ${await put.text()}`);
  }
  const registerRes = await api(opts.apiUrl, opts.token, "/api/builds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: presign.buildId,
      appId: opts.appId,
      platform,
      version,
      memo,
      sdkVersion: opts.sdk,
      artifactKey: presign.artifactKey,
      artifactUrl: presign.artifactUrl,
      fileName,
      fileSize,
      bundleId: opts.bundleId
    })
  });
  if (!registerRes.ok) {
    throw new Error(`register failed: ${registerRes.status} ${await registerRes.text()}`);
  }
  const build = await registerRes.json();
  process.stdout.write(`
Done.
`);
  process.stdout.write(`Build: ${build.id}
`);
  process.stdout.write(`Console: ${build.consoleUrl}
`);
}
var program = new Command();
program.name("rnd").description("react-native-deploy \u2014 like `ait deploy`, for IPA/APK release consoles").version("0.1.0");
function addDeployOptions(cmd) {
  return cmd.option("-f, --file <path>", "Path to .ipa / .apk / .aab (or set artifact in rnd.config.json)").option("-a, --app <appId>", "App id").option("-p, --platform <platform>", "ios | android").option("-v, --version <label>", "Version label").option("-m, --memo <text>", "Memo", "").option("--sdk <version>", "Optional SDK / RN version label").option("--bundle-id <id>", "iOS bundle id for Ad Hoc manifest").option("--api-url <url>", "Console API base").option("--token <token>", "Deploy API token (or use `rnd token add`)").option("--profile <name>", "Credentials profile name", "default");
}
function resolveArtifact(cfg, platform, fileFlag) {
  if (fileFlag) return fileFlag;
  if (platform === "android") {
    if (!cfg.artifact?.android) {
      throw new Error("No Android artifact. Set artifact.android in rnd.config.json or pass -f.");
    }
    return cfg.artifact.android;
  }
  if (platform === "ios") {
    if (!cfg.artifact?.ios) {
      throw new Error("No iOS artifact. Set artifact.ios in rnd.config.json or pass -f.");
    }
    return cfg.artifact.ios;
  }
  const ios = cfg.artifact?.ios;
  const android = cfg.artifact?.android;
  const iosOk = Boolean(ios && existsSync2(resolve(process.cwd(), ios)));
  const androidOk = Boolean(android && existsSync2(resolve(process.cwd(), android)));
  if (iosOk && androidOk) {
    throw new Error("Both IPA and APK exist. Pass --platform ios or --platform android.");
  }
  if (androidOk && android) return android;
  if (iosOk && ios) return ios;
  throw new Error(
    "No artifact file found. Build the app first, then either:\n  npx rnd deploy -f ./path/to/app.apk\nor set artifact.ios / artifact.android in rnd.config.json to a file that exists."
  );
}
async function runDeploy(opts) {
  const cfg = loadConfig();
  const file = resolveArtifact(cfg, opts.platform, opts.file);
  const token = resolveToken({ token: opts.token, profile: opts.profile });
  await deployFile({
    file,
    appId: opts.app ?? cfg.appId ?? env("RND_APP_ID", "my-app"),
    platform: opts.platform,
    version: opts.version,
    memo: opts.memo,
    sdk: opts.sdk,
    bundleId: opts.bundleId ?? cfg.bundleId ?? process.env.RND_BUNDLE_ID,
    apiUrl: opts.apiUrl ?? cfg.apiUrl ?? env("RND_API_URL"),
    token
  });
}
addDeployOptions(
  program.command("deploy").description("Upload the built IPA/APK to your release console (ait deploy equivalent)")
).action(async (opts) => {
  await runDeploy(opts);
});
addDeployOptions(
  program.command("upload").description("Alias of `rnd deploy`")
).action(async (opts) => {
  await runDeploy(opts);
});
var tokenCmd = program.command("token").description("Manage locally saved API tokens (~/.rnd/credentials)");
tokenCmd.command("add").description("Save an API token locally (like `ait token add`)").option("--api-key <token>", "API token value").argument("[profile]", "Profile name", "default").action(async (profile, opts) => {
  let token = opts.apiKey?.trim();
  if (!token) {
    const rl = createInterface({ input, output });
    token = (await rl.question("API token: ")).trim();
    rl.close();
  }
  if (!token) throw new Error("Empty token");
  addToken(profile || "default", token);
  process.stdout.write(`Saved profile "${profile || "default"}" \u2192 ${credentialsPath()}
`);
});
tokenCmd.command("remove").description("Remove a saved profile").argument("[profile]", "Profile name", "default").action((profile) => {
  const ok = removeToken(profile || "default");
  if (!ok) {
    process.stdout.write(`Profile "${profile}" not found.
`);
    return;
  }
  process.stdout.write(`Removed profile "${profile}".
`);
});
tokenCmd.command("list").description("List saved profile names (tokens are not printed)").action(() => {
  const data = loadCredentials();
  const names = Object.keys(data);
  if (names.length === 0) {
    process.stdout.write(`No profiles in ${credentialsPath()}
`);
    return;
  }
  for (const name of names) {
    process.stdout.write(`${name}
`);
  }
});
program.command("open").description("Print the console URL").option("--api-url <url>", "Console base").action((opts) => {
  const cfg = loadConfig();
  const url = opts.apiUrl ?? cfg.apiUrl ?? process.env.RND_API_URL ?? "http://localhost:3000";
  process.stdout.write(`${url.replace(/\/$/, "")}/
`);
});
program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
