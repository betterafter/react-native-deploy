// src/init-config.ts
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
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
  const configPath = join(cwd, "rnd.config.json");
  const pkgPath = join(cwd, "package.json");
  if (!existsSync(pkgPath)) {
    return {
      path: configPath,
      created: false,
      skipped: true,
      reason: "no package.json in target directory"
    };
  }
  if (existsSync(configPath) && !opts.force) {
    return {
      path: configPath,
      created: false,
      skipped: true,
      reason: "rnd.config.json already exists"
    };
  }
  const pkg = readJson(pkgPath);
  const appJson = readJson(join(cwd, "app.json"));
  const expo = appJson?.expo;
  const expoApp = hasExpo(pkg);
  const appId = slugify(expo?.slug || expo?.name || pkg?.name || "my-app") || "my-app";
  const bundleId = expo?.ios?.bundleIdentifier || expo?.android?.package || `com.example.${appId.replace(/-/g, "")}`;
  const config = {
    appId,
    bundleId,
    /** Replace with your hosted console URL (Vercel etc.) */
    apiUrl: opts.apiUrl?.trim() || "https://YOUR_CONSOLE_URL",
    artifact: {
      ios: "./build/App.ipa",
      android: "./android/app/build/outputs/apk/release/app-release.apk"
    },
    export: "./dist",
    ...expoApp ? { expoExport: true } : { expoExport: false }
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}
`, "utf8");
  if (pkg) {
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
      writeFileSync(
        pkgPath,
        `${JSON.stringify({ ...pkg, scripts }, null, 2)}
`,
        "utf8"
      );
    }
  }
  return { path: configPath, created: true, skipped: false };
}

export {
  resolveConsumerRoot,
  scaffoldRndConfig
};
