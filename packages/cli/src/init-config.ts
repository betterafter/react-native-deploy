import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type ScaffoldResult = {
  path: string;
  created: boolean;
  skipped: boolean;
  reason?: string;
};

type PackageJson = {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

type AppJson = {
  expo?: {
    name?: string;
    slug?: string;
    ios?: { bundleIdentifier?: string };
    android?: { package?: string };
  };
};

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return null;
  }
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function hasExpo(pkg: PackageJson | null): boolean {
  if (!pkg) return false;
  return Boolean(pkg.dependencies?.expo || pkg.devDependencies?.expo);
}

/** Detect consumer project root when running from a dependency postinstall. */
export function resolveConsumerRoot(explicit?: string): string {
  if (explicit) return explicit;
  return (
    process.env.INIT_CWD ||
    process.env.npm_config_local_prefix ||
    process.cwd()
  );
}

/**
 * Create rnd.config.json (and optionally a deploy script) from package.json / app.json.
 * Does not overwrite an existing config unless `force` is set.
 */
export function scaffoldRndConfig(opts: {
  cwd: string;
  force?: boolean;
  apiUrl?: string;
}): ScaffoldResult {
  const cwd = opts.cwd;
  const configPath = join(cwd, 'rnd.config.json');
  const pkgPath = join(cwd, 'package.json');

  if (!existsSync(pkgPath)) {
    return {
      path: configPath,
      created: false,
      skipped: true,
      reason: 'no package.json in target directory',
    };
  }

  if (existsSync(configPath) && !opts.force) {
    return {
      path: configPath,
      created: false,
      skipped: true,
      reason: 'rnd.config.json already exists',
    };
  }

  const pkg = readJson<PackageJson>(pkgPath);
  const appJson = readJson<AppJson>(join(cwd, 'app.json'));
  const expo = appJson?.expo;
  const expoApp = hasExpo(pkg);

  const appId =
    slugify(expo?.slug || expo?.name || pkg?.name || 'my-app') || 'my-app';
  const bundleId =
    expo?.ios?.bundleIdentifier ||
    expo?.android?.package ||
    `com.example.${appId.replace(/-/g, '')}`;

  const config = {
    appId,
    bundleId,
    /** Replace with your hosted console URL (Vercel etc.) */
    apiUrl: opts.apiUrl?.trim() || 'https://YOUR_CONSOLE_URL',
    artifact: {
      ios: './build/App.ipa',
      android: './android/app/build/outputs/apk/release/app-release.apk',
    },
    export: './dist',
    ...(expoApp ? { expoExport: true } : { expoExport: false }),
  };

  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');

  // Universal scripts: `npm run build` / `npm run deploy` → rnd
  if (pkg) {
    const scripts = { ...(pkg.scripts ?? {}) };
    let changed = false;
    if (!scripts.build) {
      scripts.build = 'rnd build';
      changed = true;
    }
    if (!scripts.deploy) {
      scripts.deploy = 'rnd deploy';
      changed = true;
    }
    if (changed) {
      writeFileSync(
        pkgPath,
        `${JSON.stringify({ ...pkg, scripts }, null, 2)}\n`,
        'utf8',
      );
    }
  }

  return { path: configPath, created: true, skipped: false };
}
