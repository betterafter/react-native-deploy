#!/usr/bin/env node
import {
  configPath,
  isPlaceholderApiUrl,
  loadConfigFile,
  rememberAndroidArtifact,
  resolveConsumerRoot,
  resolveProject,
  runCommand,
  runExpo,
  saveConfigFile,
  scaffoldRndConfig
} from "./chunk-GYYLW5XO.js";

// src/bin.ts
import { Command } from "commander";
import { createInterface } from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { existsSync as existsSync3, readFileSync as readFileSync2, statSync as statSync2 } from "fs";
import { basename as basename2, extname as extname2, resolve as resolve3 } from "path";

// src/build.ts
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync
} from "fs";
import { join, resolve } from "path";
function findReleaseApk(androidDir) {
  const releaseDir = join(androidDir, "app/build/outputs/apk/release");
  if (!existsSync(releaseDir)) return null;
  const apks = readdirSync(releaseDir).filter((f) => f.endsWith(".apk")).map((f) => join(releaseDir, f)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return apks[0] ?? null;
}
function runRndBuild(opts) {
  const project = resolveProject(opts.cwd ?? process.cwd(), { appDir: opts.appDir });
  const cwd = project.appDir;
  const platform = opts.platform ?? "android";
  const out = {};
  process.stdout.write(`App \u2192 ${cwd}
`);
  process.stdout.write(`Package manager \u2192 ${project.packageManager}
`);
  if (platform === "android" || platform === "all") {
    const androidDir = join(cwd, "android");
    if (!existsSync(androidDir) && project.hasExpo) {
      process.stdout.write("No android/ folder \u2014 running expo prebuild\u2026\n");
      runExpo(project, ["prebuild", "--platform", "android", "--no-install"]);
    }
    if (!existsSync(androidDir)) {
      throw new Error(
        `No android/ project in ${cwd}. Expo apps need a successful prebuild, or add a native android/ folder.`
      );
    }
    const gradlew = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
    process.stdout.write("Building Android release APK\u2026\n");
    runCommand(
      gradlew,
      ["assembleRelease", "-PreactNativeArchitectures=arm64-v8a"],
      androidDir
    );
    const apk = findReleaseApk(androidDir);
    if (!apk) {
      throw new Error(
        "assembleRelease finished but no APK found under android/app/build/outputs/apk/release"
      );
    }
    const stable = join(
      cwd,
      "android/app/build/outputs/apk/release/app-release.apk"
    );
    if (resolve(apk) !== resolve(stable)) {
      mkdirSync(join(cwd, "android/app/build/outputs/apk/release"), {
        recursive: true
      });
      copyFileSync(apk, stable);
      out.androidApk = stable;
    } else {
      out.androidApk = apk;
    }
    process.stdout.write(`Android APK \u2192 ${out.androidApk}
`);
    rememberAndroidArtifact(project, out.androidApk);
  }
  if (platform === "ios" || platform === "all") {
    if (process.platform !== "darwin") {
      process.stdout.write("Skipping iOS build (not macOS).\n");
    } else {
      process.stdout.write(
        "iOS IPA: use Xcode Archive or EAS, then set artifact.ios \u2014 `rnd build` ships Android APK by default for universal install QR.\n"
      );
    }
  }
  return out;
}

// src/credentials.ts
import { chmodSync, existsSync as existsSync2, mkdirSync as mkdirSync2, readFileSync, writeFileSync } from "fs";
import { homedir } from "os";
import { join as join2 } from "path";
var DIR = join2(homedir(), ".rnd");
var FILE = join2(DIR, "credentials");
function ensureDir() {
  if (!existsSync2(DIR)) mkdirSync2(DIR, { recursive: true, mode: 448 });
}
function credentialsPath() {
  return FILE;
}
function loadCredentials() {
  if (!existsSync2(FILE)) return {};
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
import { basename, extname, join as join3, relative, resolve as resolve2 } from "path";

// src/url.ts
function normalizeBaseUrl(input2) {
  let url = input2.trim().replace(/\/+$/, "");
  if (!url) {
    throw new Error("Empty apiUrl. Set rnd.config.json apiUrl or RND_API_URL.");
  }
  if (/YOUR_CONSOLE_URL/i.test(url)) {
    throw new Error(
      "apiUrl is still a placeholder. Set rnd.config.json apiUrl to your console host, e.g. my-app.vercel.app"
    );
  }
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)) {
    if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  try {
    new URL(url);
  } catch {
    throw new Error(
      `Invalid apiUrl: "${input2}". Use a host like my-app.vercel.app or https://my-app.vercel.app`
    );
  }
  return url.replace(/\/+$/, "");
}

// src/export-deploy.ts
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
      const abs = join3(current, entry.name);
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
  const root = normalizeBaseUrl(baseUrl);
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${root}${p}`, {
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
  const root = resolve2(opts.dir);
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) {
    throw new Error(`Export directory not found: ${root}
Run \`npx expo export\` first, then pass that directory.`);
  }
  const metadataPath = join3(root, "metadata.json");
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
  const expoConfigRaw = await readFile(join3(root, "expoConfig.json"), "utf8").catch(() => null);
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
    const hint = existsSync3(configPath(process.cwd())) ? "Set env or rnd.config.json / CLI flag." : "No rnd.config.json here \u2014 run `npx rnd init` first.";
    throw new Error(`Missing ${name}. ${hint}`);
  }
  return v;
}
function loadConfig() {
  return loadConfigFile(process.cwd());
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
  const root = normalizeBaseUrl(baseUrl);
  const p = path.startsWith("/") ? path : `/${path}`;
  return fetch(`${root}${p}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init?.headers ?? {}
    }
  });
}
async function deployFile(opts) {
  const filePath = resolve3(opts.file);
  if (!existsSync3(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const platform = detectPlatform(filePath, opts.platform);
  const version = opts.version ?? defaultVersion();
  const memo = opts.memo ?? "";
  const fileName = basename2(filePath);
  const fileSize = statSync2(filePath).size;
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
Done (install file).
`);
  process.stdout.write(`Build: ${build.id}
`);
  process.stdout.write(`Console: ${build.consoleUrl}
`);
}
var program = new Command();
program.name("rnd").description("react-native-deploy \u2014 like `ait deploy`, for IPA/APK release consoles").version("0.1.0");
function addDeployOptions(cmd) {
  return cmd.option("-f, --file <path>", "Path to .ipa / .apk / .aab (or set artifact in rnd.config.json)").option("-a, --app <appId>", "App id").option("-p, --platform <platform>", "ios | android").option("-v, --version <label>", "Version label").option("-m, --memo <text>", "Memo", "").option("--sdk <version>", "Optional SDK / RN version label").option("--bundle-id <id>", "iOS bundle id for Ad Hoc manifest").option("--api-url <url>", "Console API base").option("--token <token>", "Deploy API token (or use `rnd token add`)").option("--profile <name>", "Credentials profile name", "default").option(
    "--export [dir]",
    "Expo export dir for sandbox QR (default: config export or ./dist)"
  ).option("--export-only", "Upload sandbox export only (skip IPA/APK)").option("--skip-export", "Upload IPA/APK only (skip sandbox export)").option(
    "--skip-expo-export",
    "Do not run `expo export`; upload an existing export directory only"
  );
}
function resolveArtifact(cfg, platform, fileFlag, required, project) {
  if (fileFlag) return resolve3(project.configDir, fileFlag);
  const android = firstExisting([
    cfg.artifact?.android ? resolve3(project.configDir, cfg.artifact.android) : void 0,
    cfg.artifact?.android ? resolve3(project.appDir, cfg.artifact.android) : void 0,
    resolve3(project.appDir, "android/app/build/outputs/apk/release/app-release.apk")
  ]);
  const ios = firstExisting([
    cfg.artifact?.ios ? resolve3(project.configDir, cfg.artifact.ios) : void 0,
    cfg.artifact?.ios ? resolve3(project.appDir, cfg.artifact.ios) : void 0,
    resolve3(project.appDir, "build/App.ipa"),
    resolve3(project.configDir, "build/App.ipa")
  ]);
  if (platform === "android") {
    if (android) return android;
    if (!required) return null;
    throw new Error("No Android artifact. Run `npx rnd build` or pass -f ./path/to/app.apk.");
  }
  if (platform === "ios") {
    if (ios) return ios;
    if (!required) return null;
    throw new Error("No iOS artifact. Set artifact.ios in rnd.config.json or pass -f.");
  }
  if (ios && android) {
    throw new Error("Both IPA and APK exist. Pass --platform ios or --platform android.");
  }
  if (android) return android;
  if (ios) return ios;
  if (!required) return null;
  throw new Error(
    "No artifact file found. Run:\n  npx rnd build\nthen `npx rnd deploy`, or pass -f ./path/to/app.apk"
  );
}
function firstExisting(paths) {
  for (const path of paths) {
    if (path && existsSync3(path)) return path;
  }
  return null;
}
function exportDirPath(cfg, exportOpt) {
  return typeof exportOpt === "string" ? exportOpt : cfg.export ?? "./dist";
}
function resolveExportDir(cfg, exportOpt, required, project) {
  if (exportOpt === false) return null;
  const dir = exportDirPath(cfg, exportOpt);
  const fromConfig = resolve3(project.configDir, dir);
  const fromApp = resolve3(project.appDir, dir);
  if (existsSync3(fromConfig)) return fromConfig;
  if (existsSync3(fromApp)) return fromApp;
  if (required) {
    throw new Error(
      `Export directory not found: ${dir}
Deploy runs \`expo export\` by default. If you skipped it, pass an existing --export dir.`
    );
  }
  return null;
}
function shouldRunExpoExport(cfg, opts, project) {
  if (opts.skipExpoExport === true) return false;
  if (cfg.expoExport === false) return false;
  if (cfg.expoExport === true) return true;
  return project.hasExpo;
}
function runExpoExport(project, outputDir) {
  const abs = resolve3(project.configDir, outputDir);
  process.stdout.write(`Running expo export \u2192 ${abs}\u2026
`);
  runExpo(project, [
    "export",
    "--platform",
    "android",
    "--platform",
    "ios",
    "--output-dir",
    abs
  ]);
}
async function runDeploy(opts) {
  const project = resolveProject(process.cwd());
  const cfg = loadConfigFile(project.configDir);
  const exportOnly = opts.exportOnly === true;
  const skipExport = opts.skipExport === true;
  const token = resolveToken({
    token: typeof opts.token === "string" ? opts.token : void 0,
    profile: typeof opts.profile === "string" ? opts.profile : void 0
  });
  const appId = (typeof opts.app === "string" ? opts.app : void 0) ?? cfg.appId ?? env("RND_APP_ID", "my-app");
  const version = (typeof opts.version === "string" ? opts.version : void 0) ?? defaultVersion();
  const memo = typeof opts.memo === "string" ? opts.memo : "";
  const sdk = typeof opts.sdk === "string" ? opts.sdk : void 0;
  const apiUrlRaw = (typeof opts.apiUrl === "string" ? opts.apiUrl : void 0) ?? cfg.apiUrl ?? env("RND_API_URL");
  const apiUrl = normalizeBaseUrl(apiUrlRaw);
  const bundleId = (typeof opts.bundleId === "string" ? opts.bundleId : void 0) ?? cfg.bundleId ?? process.env.RND_BUNDLE_ID;
  let uploaded = 0;
  if (!exportOnly) {
    const file = resolveArtifact(
      cfg,
      typeof opts.platform === "string" ? opts.platform : void 0,
      typeof opts.file === "string" ? opts.file : void 0,
      /* required */
      Boolean(opts.file || opts.platform || skipExport),
      project
    );
    if (file) {
      await deployFile({
        file,
        appId,
        platform: typeof opts.platform === "string" ? opts.platform : void 0,
        version,
        memo,
        sdk,
        bundleId,
        apiUrl,
        token
      });
      uploaded += 1;
    } else {
      process.stdout.write(
        "No install artifact \u2014 skipping file install QR.\nRun `npx rnd build` first for APK install QR (default path).\n"
      );
    }
  }
  if (!skipExport) {
    const exportOpt = exportOnly ? opts.export ?? true : opts.export;
    const dirPath = exportDirPath(cfg, exportOpt);
    if (shouldRunExpoExport(cfg, opts, project)) {
      runExpoExport(project, resolve3(project.configDir, dirPath));
    }
    const dir = resolveExportDir(
      cfg,
      exportOpt,
      /* required */
      exportOnly || shouldRunExpoExport(cfg, opts, project) || typeof opts.export === "string",
      project
    );
    if (dir) {
      await deployExport({
        dir,
        appId,
        version,
        memo,
        sdk,
        apiUrl,
        token
      });
      uploaded += 1;
    } else if (!exportOnly) {
      process.stdout.write(
        "No sandbox export \u2014 skipping sandbox QR.\n(Expo project: deploy runs `expo export` by default. Or set expoExport: true in rnd.config.json)\n"
      );
    }
  }
  if (uploaded === 0) {
    throw new Error(
      "Nothing to deploy. Need at least one of:\n  \u2022 IPA/APK \u2014 run `npx rnd build`, then deploy again\n  \u2022 Expo sandbox \u2014 Expo app with `expo export` (default on deploy)"
    );
  }
}
program.command("build").description(
  "Build install artifact (Android release APK by default; Expo prebuild if needed)"
).option("-p, --platform <platform>", "android | ios | all", "android").option("--cwd <path>", "App directory. Default: this folder, or the Expo/RN app in a workspace").action((opts) => {
  const platform = opts.platform ?? "android";
  if (platform !== "android" && platform !== "ios" && platform !== "all") {
    throw new Error("--platform must be android | ios | all");
  }
  const result = runRndBuild({
    cwd: process.cwd(),
    appDir: opts.cwd ? resolve3(process.cwd(), opts.cwd) : void 0,
    platform
  });
  if (result.androidApk) {
    process.stdout.write(
      `
Ready for install QR. Next:
  npx rnd deploy -m "\uBA54\uBAA8"
`
    );
  }
});
addDeployOptions(
  program.command("deploy").description(
    "Default: install file QR (APK/IPA) + sandbox QR (`expo export` in Expo apps)"
  )
).action(async (opts) => {
  await runDeploy(opts);
});
addDeployOptions(
  program.command("upload").description("Alias of `rnd deploy`")
).action(async (opts) => {
  await runDeploy(opts);
});
program.command("init").description("Create rnd.config.json from package.json / app.json (safe: no overwrite)").option("--force", "Overwrite existing rnd.config.json").option("--api-url <url>", "Console base URL to write into config").option("--cwd <path>", "Project root (default: current directory)").option(
  "--with-scripts",
  "Also add build/deploy scripts to package.json (skipped by default)"
).action(
  (opts) => {
    const cwd = resolve3(opts.cwd ?? resolveConsumerRoot(process.cwd()));
    const result = scaffoldRndConfig({
      cwd,
      force: Boolean(opts.force),
      apiUrl: opts.apiUrl,
      addScripts: Boolean(opts.withScripts)
    });
    if (result.created) {
      process.stdout.write(
        `Created ${result.path}
Next:
  npx rnd token add
  npx rnd build
  npx rnd deploy -m "\uBA54\uBAA8"
`
      );
      return;
    }
    process.stdout.write(
      `Skipped: ${result.reason ?? "unknown"}${result.path ? ` (${result.path})` : ""}
`
    );
  }
);
var tokenCmd = program.command("token").description("Manage locally saved API tokens (~/.rnd/credentials)");
tokenCmd.command("add").description("Save API token (+ console apiUrl into rnd.config.json if missing)").option("--api-key <token>", "API token value").option("--api-url <url>", "Console base URL to write into rnd.config.json").argument("[profile]", "Profile name", "default").action(async (profile, opts) => {
  const cwd = process.cwd();
  let cfg = loadConfigFile(cwd);
  if (!existsSync3(resolve3(cwd, "rnd.config.json"))) {
    scaffoldRndConfig({ cwd });
    cfg = loadConfigFile(cwd);
  }
  const rl = createInterface({ input, output });
  try {
    let token = opts.apiKey?.trim();
    if (!token) {
      token = (await rl.question("API token: ")).trim();
    }
    if (!token) throw new Error("Empty token");
    let apiUrl = opts.apiUrl?.trim() || cfg.apiUrl;
    if (isPlaceholderApiUrl(apiUrl)) {
      apiUrl = (await rl.question(
        "Console URL (e.g. my-app.vercel.app): "
      )).trim();
    }
    if (!apiUrl) throw new Error("Empty console URL");
    const normalized = normalizeBaseUrl(apiUrl);
    addToken(profile || "default", token);
    saveConfigFile({ ...cfg, apiUrl: normalized }, cwd);
    process.stdout.write(
      `Saved profile "${profile || "default"}" \u2192 ${credentialsPath()}
Saved apiUrl \u2192 rnd.config.json (${normalized})
Next:
  npx rnd build
  npx rnd deploy -m "\uBA54\uBAA8"
`
    );
  } finally {
    rl.close();
  }
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
  const url = normalizeBaseUrl(
    opts.apiUrl ?? cfg.apiUrl ?? process.env.RND_API_URL ?? "http://localhost:3000"
  );
  process.stdout.write(`${url}/
`);
});
program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
