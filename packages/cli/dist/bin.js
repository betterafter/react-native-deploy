#!/usr/bin/env node

// src/bin.ts
import { Command } from "commander";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { existsSync as existsSync2, readFileSync as readFileSync2, statSync } from "fs";
import { basename as basename2, extname as extname2, resolve as resolve2 } from "path";

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

// src/export-deploy.ts
import { createHash, randomUUID } from "crypto";
import { readdir, readFile, stat } from "fs/promises";
import { basename, extname, join as join2, relative, resolve } from "path";
var MIME = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
  json: "application/json",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  wav: "audio/wav",
  hbc: "application/javascript",
  js: "application/javascript",
  bundle: "application/javascript",
  txt: "text/plain"
};
function contentTypeFor(filePath) {
  const ext = extname(filePath).slice(1).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}
function posixRelative(root, file) {
  return relative(root, file).split("\\").join("/");
}
async function listFiles(root) {
  const out = [];
  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".DS_Store" || entry.name === "node_modules") continue;
      const abs = join2(current, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (!entry.name.endsWith(".map")) {
        out.push(abs);
      }
    }
  }
  await walk(root);
  return out;
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
function assetFrom(bytes, url, launch, ext) {
  const asset = {
    hash: createHash("sha256").update(bytes).digest("base64url"),
    key: createHash("md5").update(bytes).digest("hex"),
    contentType: launch ? "application/javascript" : contentTypeFor(`file.${ext ?? "bin"}`),
    url
  };
  if (!launch && ext) asset.fileExtension = `.${ext.replace(/^\./, "")}`;
  return asset;
}
async function deployExport(opts) {
  const root = resolve(opts.dir);
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) {
    throw new Error(`Export directory not found: ${root}
Run \`npx expo export\` first, then pass that directory.`);
  }
  const metadataPath = join2(root, "metadata.json");
  const metadataRaw = await readFile(metadataPath, "utf8").catch(() => null);
  if (!metadataRaw) {
    throw new Error(`No metadata.json in ${root}. Run \`npx expo export\` and pass its output directory.`);
  }
  const metadata = JSON.parse(metadataRaw);
  const platforms = ["android", "ios"].filter((platform) => metadata.fileMetadata?.[platform]?.bundle);
  if (platforms.length === 0) {
    throw new Error("metadata.json has no android or ios bundle. Export with `npx expo export`.");
  }
  const files = await listFiles(root);
  process.stdout.write(`Uploading Expo export (${files.length} files) for sandbox QR\u2026
`);
  const presignRes = await api(opts.apiUrl, opts.token, "/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      appId: opts.appId,
      files: files.map((file) => ({
        path: posixRelative(root, file),
        contentType: contentTypeFor(file)
      }))
    })
  });
  if (!presignRes.ok) {
    throw new Error(`export presign failed: ${presignRes.status} ${await presignRes.text()}`);
  }
  const presign = await presignRes.json();
  const byPath = new Map(presign.files.map((file) => [file.path, file]));
  let fileSize = 0;
  const uploaded = /* @__PURE__ */ new Map();
  for (const file of files) {
    const rel = posixRelative(root, file);
    const target = byPath.get(rel);
    if (!target) throw new Error(`Missing upload URL for ${rel}`);
    const bytes = await readFile(file);
    fileSize += bytes.length;
    const put = await fetch(target.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": contentTypeFor(file),
        "Content-Length": String(bytes.length)
      },
      body: bytes
    });
    if (!put.ok) {
      throw new Error(`upload failed for ${rel}: ${put.status} ${await put.text()}`);
    }
    uploaded.set(rel, { url: target.publicUrl, bytes });
    process.stdout.write(`  ${rel}
`);
  }
  const expoConfigRaw = await readFile(join2(root, "expoConfig.json"), "utf8").catch(() => null);
  const expoConfig = expoConfigRaw ? JSON.parse(expoConfigRaw) : null;
  function bundleFor(platform) {
    const meta = metadata.fileMetadata?.[platform];
    if (!meta?.bundle) return void 0;
    const launchRel = meta.bundle.replace(/^\.\//, "");
    const launch = uploaded.get(launchRel);
    if (!launch) throw new Error(`Bundle file missing from export: ${launchRel}`);
    const assets = (meta.assets ?? []).map((asset) => {
      const rel = asset.path.replace(/^\.\//, "");
      const file = uploaded.get(rel);
      if (!file) throw new Error(`Asset missing from export: ${rel}`);
      return assetFrom(file.bytes, file.url, false, asset.ext);
    });
    return {
      launchAsset: assetFrom(launch.bytes, launch.url, true),
      assets
    };
  }
  const registerRes = await api(opts.apiUrl, opts.token, "/api/builds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: presign.buildId,
      appId: opts.appId,
      platform: "sandbox",
      version: opts.version,
      memo: opts.memo,
      sdkVersion: opts.sdk,
      artifactKey: `apps/${opts.appId}/builds/${presign.buildId}/export`,
      artifactUrl: "",
      fileName: basename(root),
      fileSize,
      exportManifest: {
        id: randomUUID(),
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        platforms: {
          android: bundleFor("android"),
          ios: bundleFor("ios")
        },
        expoConfig
      }
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
  process.stdout.write(`QR test: ${build.installUrl}
`);
  process.stdout.write(`Console: ${build.consoleUrl}
`);
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
  const path = resolve2(process.cwd(), "rnd.config.json");
  if (!existsSync2(path)) return {};
  try {
    return JSON.parse(readFileSync2(path, "utf8"));
  } catch {
    throw new Error(`Invalid rnd.config.json at ${path}`);
  }
}
function detectPlatform(file, explicit) {
  if (explicit === "ios" || explicit === "android") return explicit;
  const ext = extname2(file).toLowerCase();
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
async function api2(baseUrl, token, path, init) {
  return fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init?.headers ?? {}
    }
  });
}
async function deployFile(opts) {
  const filePath = resolve2(opts.file);
  if (!existsSync2(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const platform = detectPlatform(filePath, opts.platform);
  const version = opts.version ?? defaultVersion();
  const memo = opts.memo ?? "";
  const fileName = basename2(filePath);
  const fileSize = statSync(filePath).size;
  const bytes = readFileSync2(filePath);
  process.stdout.write(`Deploying ${fileName} (${platform}) as ${version}\u2026
`);
  const contentType = platform === "ios" ? "application/octet-stream" : fileName.endsWith(".aab") ? "application/octet-stream" : "application/vnd.android.package-archive";
  const presignRes = await api2(opts.apiUrl, opts.token, "/api/presign", {
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
  const registerRes = await api2(opts.apiUrl, opts.token, "/api/builds", {
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
  return cmd.option("-f, --file <path>", "Path to .ipa / .apk / .aab (or set artifact in rnd.config.json)").option("-a, --app <appId>", "App id").option("-p, --platform <platform>", "ios | android").option("-v, --version <label>", "Version label").option("-m, --memo <text>", "Memo", "").option("--sdk <version>", "Optional SDK / RN version label").option("--bundle-id <id>", "iOS bundle id for Ad Hoc manifest").option("--api-url <url>", "Console API base").option("--token <token>", "Deploy API token (or use `rnd token add`)").option("--profile <name>", "Credentials profile name", "default").option("--export [dir]", "Upload an Expo export directory and open it with the sandbox QR");
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
  const iosOk = Boolean(ios && existsSync2(resolve2(process.cwd(), ios)));
  const androidOk = Boolean(android && existsSync2(resolve2(process.cwd(), android)));
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
  if (opts.export) {
    const dir = typeof opts.export === "string" ? opts.export : cfg.export ?? "./dist";
    const token2 = resolveToken({
      token: typeof opts.token === "string" ? opts.token : void 0,
      profile: typeof opts.profile === "string" ? opts.profile : void 0
    });
    await deployExport({
      dir,
      appId: (typeof opts.app === "string" ? opts.app : void 0) ?? cfg.appId ?? env("RND_APP_ID", "my-app"),
      version: (typeof opts.version === "string" ? opts.version : void 0) ?? defaultVersion(),
      memo: typeof opts.memo === "string" ? opts.memo : "",
      sdk: typeof opts.sdk === "string" ? opts.sdk : void 0,
      apiUrl: (typeof opts.apiUrl === "string" ? opts.apiUrl : void 0) ?? cfg.apiUrl ?? env("RND_API_URL"),
      token: token2
    });
    return;
  }
  const file = resolveArtifact(
    cfg,
    typeof opts.platform === "string" ? opts.platform : void 0,
    typeof opts.file === "string" ? opts.file : void 0
  );
  const token = resolveToken({
    token: typeof opts.token === "string" ? opts.token : void 0,
    profile: typeof opts.profile === "string" ? opts.profile : void 0
  });
  await deployFile({
    file,
    appId: (typeof opts.app === "string" ? opts.app : void 0) ?? cfg.appId ?? env("RND_APP_ID", "my-app"),
    platform: typeof opts.platform === "string" ? opts.platform : void 0,
    version: typeof opts.version === "string" ? opts.version : void 0,
    memo: typeof opts.memo === "string" ? opts.memo : void 0,
    sdk: typeof opts.sdk === "string" ? opts.sdk : void 0,
    bundleId: (typeof opts.bundleId === "string" ? opts.bundleId : void 0) ?? cfg.bundleId ?? process.env.RND_BUNDLE_ID,
    apiUrl: (typeof opts.apiUrl === "string" ? opts.apiUrl : void 0) ?? cfg.apiUrl ?? env("RND_API_URL"),
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
