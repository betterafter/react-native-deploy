// src/config-io.ts
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";
function configPath(cwd = process.cwd()) {
  return resolve(cwd, "rnd.config.json");
}
function loadConfigFile(cwd = process.cwd()) {
  const path = configPath(cwd);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`Invalid rnd.config.json at ${path}`);
  }
}
function saveConfigFile(cfg, cwd = process.cwd()) {
  const path = configPath(cwd);
  writeFileSync(path, `${JSON.stringify(cfg, null, 2)}
`, "utf8");
}
function isPlaceholderApiUrl(url) {
  if (!url?.trim()) return true;
  return /YOUR_CONSOLE_URL/i.test(url);
}

// src/project.ts
import { spawnSync } from "child_process";
import { createRequire } from "module";
import { existsSync as existsSync2, readFileSync as readFileSync2, readdirSync, statSync, unlinkSync, writeFileSync as writeFileSync2 } from "fs";
import { dirname, join, relative, resolve as resolve2 } from "path";
var SKIP_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  ".pnpm",
  "dist",
  "build",
  "android",
  "ios"
]);
function readPkg(dir) {
  const path = join(dir, "package.json");
  if (!existsSync2(path)) return null;
  try {
    return JSON.parse(readFileSync2(path, "utf8"));
  } catch {
    return null;
  }
}
function depsOf(pkg) {
  return { ...pkg?.dependencies ?? {}, ...pkg?.devDependencies ?? {} };
}
function toPosix(path) {
  return path.split("\\").join("/");
}
function walkUp(start, found) {
  let dir = resolve2(start);
  for (; ; ) {
    if (found(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}
function childDirs(dir) {
  if (!existsSync2(dir)) return [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !SKIP_DIRS.has(entry.name)).map((entry) => join(dir, entry.name));
}
function expandWorkspacePattern(root, pattern) {
  const parts = pattern.split("/").filter((part) => part && part !== ".");
  let dirs = [resolve2(root)];
  for (const part of parts) {
    const next = [];
    for (const dir of dirs) {
      if (part === "*") {
        next.push(...childDirs(dir));
      } else if (part === "**") {
        next.push(dir, ...walkAll(dir));
      } else {
        const candidate = join(dir, part);
        if (existsSync2(candidate) && statSync(candidate).isDirectory()) next.push(candidate);
      }
    }
    dirs = next;
  }
  return dirs.filter((dir) => existsSync2(join(dir, "package.json")));
}
function walkAll(dir) {
  const out = [];
  for (const child of childDirs(dir)) {
    out.push(child, ...walkAll(child));
  }
  return out;
}
function workspacePatterns(dir) {
  const yamlPath = join(dir, "pnpm-workspace.yaml");
  if (existsSync2(yamlPath)) {
    const patterns = [];
    let inPackages = false;
    for (const line of readFileSync2(yamlPath, "utf8").split(/\r?\n/)) {
      if (/^packages:\s*$/.test(line)) {
        inPackages = true;
        continue;
      }
      if (!inPackages) continue;
      if (/^\S/.test(line)) break;
      const match = line.match(/^\s+-\s+['"]?([^'"#]+?)['"]?\s*(?:#.*)?$/);
      if (match) patterns.push(match[1].trim());
    }
    return patterns;
  }
  const workspaces = readPkg(dir)?.workspaces;
  if (Array.isArray(workspaces)) return workspaces;
  if (workspaces && Array.isArray(workspaces.packages)) return workspaces.packages;
  return null;
}
function workspaceRootOf(start) {
  return walkUp(start, (dir) => workspacePatterns(dir) !== null) ?? resolve2(start);
}
function preferredPackageManager(root) {
  const declared = readPkg(root)?.packageManager ?? "";
  if (declared.startsWith("pnpm")) return "pnpm";
  if (declared.startsWith("yarn")) return "yarn";
  if (declared.startsWith("npm")) return "npm";
  if (existsSync2(join(root, "pnpm-lock.yaml")) || existsSync2(join(root, "pnpm-workspace.yaml"))) {
    return "pnpm";
  }
  if (existsSync2(join(root, "yarn.lock"))) return "yarn";
  return "npm";
}
var FALLBACK_ORDER = ["npm", "yarn", "pnpm"];
function choosePackageManager(preferred, available) {
  if (available(preferred)) return preferred;
  const fallback = FALLBACK_ORDER.find((name) => name !== preferred && available(name));
  if (!fallback) {
    throw new Error(
      `This project uses ${preferred}, but ${preferred} is not installed and npm/yarn/pnpm were not found on PATH.`
    );
  }
  return fallback;
}
function commandExists(name) {
  const checker = process.platform === "win32" ? "where.exe" : "which";
  const result = spawnSync(checker, [name], { stdio: "ignore" });
  return result.status === 0;
}
function detectPackageManager(root) {
  const preferred = preferredPackageManager(root);
  const chosen = choosePackageManager(preferred, commandExists);
  if (chosen !== preferred) {
    process.stdout.write(`${preferred} is not installed. Using ${chosen} instead.
`);
  }
  return chosen;
}
function appKind(dir) {
  const deps = depsOf(readPkg(dir));
  if (deps.expo) return "expo";
  const android = existsSync2(join(dir, "android/gradlew")) || existsSync2(join(dir, "android/gradlew.bat"));
  if (deps["react-native"] && android) return "bare";
  return null;
}
function listWorkspaceApps(root) {
  const patterns = workspacePatterns(root);
  if (!patterns) return [];
  const seen = /* @__PURE__ */ new Set();
  const apps = [];
  for (const pattern of patterns) {
    for (const dir of expandWorkspacePattern(root, pattern)) {
      const abs = resolve2(dir);
      if (seen.has(abs) || !appKind(abs)) continue;
      seen.add(abs);
      apps.push(abs);
    }
  }
  return apps;
}
function configDirOf(start) {
  return walkUp(start, (dir) => existsSync2(join(dir, "rnd.config.json"))) ?? resolve2(start);
}
function resolveProject(start, opts) {
  const invocation = resolve2(start);
  const configDir = configDirOf(opts?.appDir ?? invocation);
  const workspaceRoot = workspaceRootOf(opts?.appDir ?? invocation);
  const packageManager = detectPackageManager(workspaceRoot);
  if (opts?.appDir) {
    const appDir = resolve2(opts.appDir);
    if (!existsSync2(appDir)) {
      throw new Error(`App directory not found: ${appDir}`);
    }
    return {
      configDir,
      appDir,
      workspaceRoot,
      packageManager,
      hasExpo: appKind(appDir) === "expo" || Boolean(depsOf(readPkg(appDir)).expo)
    };
  }
  const configured = loadConfigFile(configDir).appDir;
  if (configured) {
    const appDir = resolve2(configDir, configured);
    if (!existsSync2(appDir)) {
      throw new Error(
        `appDir in rnd.config.json does not exist: ${configured}
Looked in ${appDir}`
      );
    }
    return {
      configDir,
      appDir,
      workspaceRoot,
      packageManager,
      hasExpo: Boolean(depsOf(readPkg(appDir)).expo)
    };
  }
  if (appKind(invocation)) {
    return projectAt(invocation, configDir, workspaceRoot, packageManager);
  }
  const apps = listWorkspaceApps(workspaceRoot);
  if (apps.length === 1) {
    return projectAt(apps[0], configDir, workspaceRoot, packageManager);
  }
  if (apps.length > 1) {
    const lines = apps.map((dir) => `  ${toPosix(relative(configDir, dir)) || "."}`).join("\n");
    throw new Error(
      `Found ${apps.length} React Native apps. Set "appDir" in rnd.config.json to one of:
${lines}`
    );
  }
  throw new Error(
    'No Expo or React Native app found in this folder.\nRun rnd from the app directory, pass --cwd, or set "appDir" in rnd.config.json.'
  );
}
function projectAt(appDir, configDir, workspaceRoot, packageManager) {
  return {
    configDir,
    appDir,
    workspaceRoot,
    packageManager,
    hasExpo: Boolean(depsOf(readPkg(appDir)).expo)
  };
}
function runCommand(command, args, cwd) {
  process.stdout.write(`$ ${command} ${args.join(" ")}
`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env
  });
  if (result.error) {
    throw new Error(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? 1}`);
  }
}
function moduleInstalled(appDir, name) {
  try {
    createRequire(join(appDir, "package.json")).resolve(`${name}/package.json`);
    return true;
  } catch {
    return false;
  }
}
function parseVersion(input) {
  const match = input.replace(/^v/, "").match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}
function compareVersion(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}
function nodeSatisfies(current, range) {
  const orParts = range.split("||").map((part) => part.trim()).filter(Boolean);
  if (orParts.length === 0) return true;
  return orParts.some((part) => {
    if (part === "*" || part === "x") return true;
    const tokens = part.split(/\s+/);
    return tokens.every((token) => satisfiesComparator(current, token));
  });
}
function satisfiesComparator(current, token) {
  if (token === "*" || token === "x") return true;
  const normalized = token.replace(/\.x$/i, "").replace(/\.x\./gi, ".");
  const bare = normalized.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (bare && !normalized.includes(".")) {
    return satisfiesComparator(current, `^${bare[1]}.0.0`);
  }
  if (/^\d+\.x$/i.test(token) || /^\d+$/.test(token)) {
    return satisfiesComparator(current, `^${token.replace(/\.x$/i, "")}.0.0`);
  }
  const match = normalized.match(/^(>=|<=|>|<|=|\^|~)?(\d+(?:\.\d+){0,2})$/);
  if (!match) return true;
  const op = match[1] ?? "=";
  const wanted = parseVersion(match[2]);
  const actual = parseVersion(current);
  if (!wanted || !actual) return true;
  const cmp = compareVersion(actual, wanted);
  if (op === ">=") return cmp >= 0;
  if (op === ">") return cmp > 0;
  if (op === "<=") return cmp <= 0;
  if (op === "<") return cmp < 0;
  if (op === "=") return cmp === 0;
  if (op === "~") {
    const upper2 = [wanted[0], wanted[1] + 1, 0];
    return cmp >= 0 && compareVersion(actual, upper2) < 0;
  }
  const upper = [wanted[0] + 1, 0, 0];
  return cmp >= 0 && compareVersion(actual, upper) < 0;
}
function assertNodeForInstall(dir) {
  const pkg = readPkg(dir);
  const range = pkg?.engines?.node;
  if (!range || nodeSatisfies(process.versions.node, range)) return;
  const name = pkg?.name ?? toPosix(dir);
  throw new Error(
    `This project requires Node.js ${range} (${name} package.json engines).
Current Node.js is v${process.versions.node}.
rnd itself runs on Node.js 20+, but this project's package manager does not.
Switch Node.js, then run the command again.`
  );
}
function workspacePackageIndex(root) {
  const index = /* @__PURE__ */ new Map();
  const patterns = workspacePatterns(root);
  if (!patterns) return index;
  for (const pattern of patterns) {
    for (const dir of expandWorkspacePattern(root, pattern)) {
      const name = readPkg(dir)?.name;
      if (name) index.set(name, dir);
    }
  }
  return index;
}
function packageJsonForNpm(pkg, fromDir, packages) {
  const rewrite = (deps) => {
    if (!deps) return deps;
    const next = { ...deps };
    for (const [name, spec] of Object.entries(next)) {
      if (!spec.startsWith("workspace:")) continue;
      const target = packages.get(name);
      if (!target) continue;
      let rel = toPosix(relative(fromDir, target)) || ".";
      if (!rel.startsWith(".")) rel = `./${rel}`;
      next[name] = `file:${rel}`;
    }
    return next;
  };
  return {
    ...pkg,
    dependencies: rewrite(pkg.dependencies),
    devDependencies: rewrite(pkg.devDependencies)
  };
}
function installDependencies(project) {
  if (project.packageManager === "pnpm") {
    process.stdout.write(`Running pnpm install in ${project.workspaceRoot}\u2026
`);
    runCommand("pnpm", ["install"], project.workspaceRoot);
    return;
  }
  const installDir = project.appDir;
  const pkgPath = join(installDir, "package.json");
  const original = existsSync2(pkgPath) ? readFileSync2(pkgPath, "utf8") : null;
  const pkg = readPkg(installDir);
  const rewritten = pkg ? packageJsonForNpm(pkg, installDir, workspacePackageIndex(project.workspaceRoot)) : null;
  const lockPath = join(installDir, "package-lock.json");
  const hadLock = existsSync2(lockPath);
  process.stdout.write(`Running ${project.packageManager} install in ${installDir}\u2026
`);
  try {
    if (rewritten && original != null && JSON.stringify(rewritten) !== JSON.stringify(pkg)) {
      writeFileSync2(pkgPath, `${JSON.stringify(rewritten, null, 2)}
`);
    }
    const args = project.packageManager === "npm" ? ["install", "--no-package-lock"] : ["install"];
    runCommand(project.packageManager, args, installDir);
  } finally {
    if (original != null) writeFileSync2(pkgPath, original);
    if (!hadLock && existsSync2(lockPath)) unlinkSync(lockPath);
  }
}
function ensureDependency(project, name) {
  if (moduleInstalled(project.appDir, name)) return;
  assertNodeForInstall(project.workspaceRoot);
  assertNodeForInstall(project.appDir);
  process.stdout.write(`${name} is not installed. `);
  installDependencies(project);
  if (!moduleInstalled(project.appDir, name)) {
    throw new Error(
      `${name} is listed in ${project.appDir} but is still not installed.
Run \`${project.packageManager} install\` in ${project.appDir}, then retry.`
    );
  }
}
function runExpo(project, args) {
  ensureDependency(project, "expo");
  if (project.packageManager === "pnpm") {
    runCommand("pnpm", ["exec", "expo", ...args], project.appDir);
    return;
  }
  if (project.packageManager === "yarn") {
    runCommand("yarn", ["expo", ...args], project.appDir);
    return;
  }
  runCommand("npm", ["exec", "--", "expo", ...args], project.appDir);
}
function rememberAndroidArtifact(project, apk) {
  if (!existsSync2(join(project.configDir, "rnd.config.json"))) return;
  const cfg = loadConfigFile(project.configDir);
  const appDir = toPosix(relative(project.configDir, project.appDir)) || ".";
  const android = toPosix(relative(project.configDir, apk));
  saveConfigFile(
    {
      ...cfg,
      ...appDir !== "." ? { appDir } : {},
      artifact: { ...cfg.artifact, android }
    },
    project.configDir
  );
  process.stdout.write(`Updated rnd.config.json artifact.android \u2192 ${android}
`);
}

// src/init-config.ts
import { existsSync as existsSync3, readFileSync as readFileSync3, writeFileSync as writeFileSync3 } from "fs";
import { join as join2, relative as relative2, resolve as resolve3 } from "path";
function readJson(path) {
  if (!existsSync3(path)) return null;
  try {
    return JSON.parse(readFileSync3(path, "utf8"));
  } catch {
    return null;
  }
}
function slugify(input) {
  return input.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}
function hasExpo(pkg) {
  if (!pkg) return false;
  return Boolean(pkg.dependencies?.expo || pkg.devDependencies?.expo);
}
function resolveConsumerRoot(explicit) {
  if (explicit) return explicit;
  return process.env.INIT_CWD || process.env.npm_config_local_prefix || process.cwd();
}
function scaffoldRndConfig(opts) {
  const cwd = opts.cwd;
  const configPath2 = join2(cwd, "rnd.config.json");
  const pkgPath = join2(cwd, "package.json");
  if (!existsSync3(pkgPath)) {
    return {
      path: configPath2,
      created: false,
      skipped: true,
      reason: "no package.json in target directory"
    };
  }
  if (existsSync3(configPath2) && !opts.force) {
    return {
      path: configPath2,
      created: false,
      skipped: true,
      reason: "rnd.config.json already exists"
    };
  }
  const pkg = readJson(pkgPath);
  const appJson = readJson(join2(cwd, "app.json"));
  const expo = appJson?.expo;
  const expoApp = hasExpo(pkg);
  const discovered = discoverNestedApp(cwd);
  const appId = slugify(expo?.slug || expo?.name || pkg?.name || "my-app") || "my-app";
  const bundleId = expo?.ios?.bundleIdentifier || expo?.android?.package || `com.example.${appId.replace(/-/g, "")}`;
  const config = {
    appId,
    bundleId,
    /** Replace with your hosted console URL (Vercel etc.) */
    apiUrl: opts.apiUrl?.trim() || "https://YOUR_CONSOLE_URL",
    ...discovered ? { appDir: discovered } : {},
    artifact: {
      ios: "./build/App.ipa",
      android: discovered ? `${discovered}/android/app/build/outputs/apk/release/app-release.apk` : "./android/app/build/outputs/apk/release/app-release.apk"
    },
    export: discovered ? `${discovered}/dist` : "./dist",
    ...expoApp || discovered ? { expoExport: true } : { expoExport: false }
  };
  writeFileSync3(configPath2, `${JSON.stringify(config, null, 2)}
`, "utf8");
  if (opts.addScripts && pkg) {
    const scripts = { ...pkg.scripts ?? {} };
    let changed = false;
    if (!scripts.build) {
      scripts.build = "rnd build";
      changed = true;
    }
    if (!scripts.deploy) {
      scripts.deploy = "rnd deploy";
      changed = true;
    }
    if (changed) {
      writeFileSync3(
        pkgPath,
        `${JSON.stringify({ ...pkg, scripts }, null, 2)}
`,
        "utf8"
      );
    }
  }
  return { path: configPath2, created: true, skipped: false };
}
function discoverNestedApp(cwd) {
  try {
    const appDir = resolveProject(cwd).appDir;
    if (resolve3(appDir) === resolve3(cwd)) return null;
    return toPosix(relative2(cwd, appDir));
  } catch {
    return null;
  }
}

export {
  configPath,
  loadConfigFile,
  saveConfigFile,
  isPlaceholderApiUrl,
  resolveProject,
  runCommand,
  runExpo,
  rememberAndroidArtifact,
  resolveConsumerRoot,
  scaffoldRndConfig
};
