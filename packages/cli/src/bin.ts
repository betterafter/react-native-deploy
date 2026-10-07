#!/usr/bin/env node
import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import {
  addToken,
  credentialsPath,
  loadCredentials,
  removeToken,
  resolveToken,
} from './credentials.js';
import { deployExport } from './export-deploy.js';
import { resolveConsumerRoot, scaffoldRndConfig } from './init-config.js';

type Platform = 'ios' | 'android';

type RndConfig = {
  appId?: string;
  bundleId?: string;
  apiUrl?: string;
  artifact?: {
    ios?: string;
    android?: string;
  };
  /** Output directory for `expo export` / sandbox upload. Default: ./dist */
  export?: string;
  /**
   * Run `npx expo export` before sandbox upload.
   * Default: true when the project depends on `expo`.
   */
  expoExport?: boolean;
};

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v == null || v === '') {
    throw new Error(`Missing ${name}. Set env or rnd.config.json / CLI flag.`);
  }
  return v;
}

function loadConfig(): RndConfig {
  const path = resolve(process.cwd(), 'rnd.config.json');
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as RndConfig;
  } catch {
    throw new Error(`Invalid rnd.config.json at ${path}`);
  }
}

function detectPlatform(file: string, explicit?: string): Platform {
  if (explicit === 'ios' || explicit === 'android') return explicit;
  const ext = extname(file).toLowerCase();
  if (ext === '.ipa') return 'ios';
  if (ext === '.apk' || ext === '.aab') return 'android';
  throw new Error('Cannot detect platform. Pass --platform ios|android');
}

function defaultVersion(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const n = String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
  return `${y}${m}${day}-${n}`;
}

async function api(baseUrl: string, token: string, path: string, init?: RequestInit) {
  return fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
}

async function deployFile(opts: {
  file: string;
  appId: string;
  platform?: string;
  version?: string;
  memo?: string;
  sdk?: string;
  bundleId?: string;
  apiUrl: string;
  token: string;
}) {
  const filePath = resolve(opts.file);
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const platform = detectPlatform(filePath, opts.platform);
  const version = opts.version ?? defaultVersion();
  const memo = opts.memo ?? '';
  const fileName = basename(filePath);
  const fileSize = statSync(filePath).size;
  const bytes = readFileSync(filePath);

  process.stdout.write(`Deploying ${fileName} (${platform}) as ${version}…\n`);

  const contentType =
    platform === 'ios'
      ? 'application/octet-stream'
      : fileName.endsWith('.aab')
        ? 'application/octet-stream'
        : 'application/vnd.android.package-archive';

  const presignRes = await api(opts.apiUrl, opts.token, '/api/presign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appId: opts.appId,
      platform,
      version,
      fileName,
      contentType,
    }),
  });
  if (!presignRes.ok) {
    throw new Error(`presign failed: ${presignRes.status} ${await presignRes.text()}`);
  }
  const presign = (await presignRes.json()) as {
    buildId: string;
    uploadUrl: string;
    artifactKey: string;
    artifactUrl: string;
  };

  const put = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(fileSize),
    },
    body: bytes,
  });
  if (!put.ok) {
    throw new Error(`upload failed: ${put.status} ${await put.text()}`);
  }

  const registerRes = await api(opts.apiUrl, opts.token, '/api/builds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
      bundleId: opts.bundleId,
    }),
  });
  if (!registerRes.ok) {
    throw new Error(`register failed: ${registerRes.status} ${await registerRes.text()}`);
  }
  const build = (await registerRes.json()) as { id: string; consoleUrl: string };
  process.stdout.write(`\nDone.\n`);
  process.stdout.write(`Build: ${build.id}\n`);
  process.stdout.write(`Console: ${build.consoleUrl}\n`);
}

const program = new Command();
program
  .name('rnd')
  .description('react-native-deploy — like `ait deploy`, for IPA/APK release consoles')
  .version('0.1.0');

function addDeployOptions(cmd: Command) {
  return cmd
    .option('-f, --file <path>', 'Path to .ipa / .apk / .aab (or set artifact in rnd.config.json)')
    .option('-a, --app <appId>', 'App id')
    .option('-p, --platform <platform>', 'ios | android')
    .option('-v, --version <label>', 'Version label')
    .option('-m, --memo <text>', 'Memo', '')
    .option('--sdk <version>', 'Optional SDK / RN version label')
    .option('--bundle-id <id>', 'iOS bundle id for Ad Hoc manifest')
    .option('--api-url <url>', 'Console API base')
    .option('--token <token>', 'Deploy API token (or use `rnd token add`)')
    .option('--profile <name>', 'Credentials profile name', 'default')
    .option(
      '--export [dir]',
      'Expo export dir for sandbox QR (default: config export or ./dist)',
    )
    .option('--export-only', 'Upload sandbox export only (skip IPA/APK)')
    .option('--skip-export', 'Upload IPA/APK only (skip sandbox export)')
    .option(
      '--skip-expo-export',
      'Do not run `expo export`; upload an existing export directory only',
    );
}

/** Returns artifact path, or null when none is available (unless required). */
function resolveArtifact(
  cfg: RndConfig,
  platform: string | undefined,
  fileFlag: string | undefined,
  required: boolean,
): string | null {
  if (fileFlag) return fileFlag;
  if (platform === 'android') {
    if (!cfg.artifact?.android) {
      if (!required) return null;
      throw new Error('No Android artifact. Set artifact.android in rnd.config.json or pass -f.');
    }
    const path = resolve(process.cwd(), cfg.artifact.android);
    if (!existsSync(path)) {
      if (!required) return null;
      throw new Error(`Android artifact not found: ${cfg.artifact.android}`);
    }
    return cfg.artifact.android;
  }
  if (platform === 'ios') {
    if (!cfg.artifact?.ios) {
      if (!required) return null;
      throw new Error('No iOS artifact. Set artifact.ios in rnd.config.json or pass -f.');
    }
    const path = resolve(process.cwd(), cfg.artifact.ios);
    if (!existsSync(path)) {
      if (!required) return null;
      throw new Error(`iOS artifact not found: ${cfg.artifact.ios}`);
    }
    return cfg.artifact.ios;
  }

  const ios = cfg.artifact?.ios;
  const android = cfg.artifact?.android;
  const iosOk = Boolean(ios && existsSync(resolve(process.cwd(), ios)));
  const androidOk = Boolean(android && existsSync(resolve(process.cwd(), android)));
  if (iosOk && androidOk) {
    throw new Error('Both IPA and APK exist. Pass --platform ios or --platform android.');
  }
  if (androidOk && android) return android;
  if (iosOk && ios) return ios;
  if (!required) return null;
  throw new Error(
    'No artifact file found. Build the app first, then either:\n' +
      '  npx rnd deploy -f ./path/to/app.apk\n' +
      'or set artifact.ios / artifact.android in rnd.config.json to a file that exists.',
  );
}

function exportDirPath(cfg: RndConfig, exportOpt: string | boolean | undefined): string {
  return typeof exportOpt === 'string' ? exportOpt : (cfg.export ?? './dist');
}

function resolveExportDir(
  cfg: RndConfig,
  exportOpt: string | boolean | undefined,
  required: boolean,
): string | null {
  if (exportOpt === false) return null;
  const dir = exportDirPath(cfg, exportOpt);
  const abs = resolve(process.cwd(), dir);
  if (existsSync(abs)) return dir;
  if (required) {
    throw new Error(
      `Export directory not found: ${dir}\n` +
        'Deploy runs `expo export` by default. If you skipped it, pass an existing --export dir.',
    );
  }
  return null;
}

function projectHasExpo(): boolean {
  const pkgPath = resolve(process.cwd(), 'package.json');
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(pkg.dependencies?.expo || pkg.devDependencies?.expo);
  } catch {
    return false;
  }
}

function shouldRunExpoExport(
  cfg: RndConfig,
  opts: Record<string, string | boolean | undefined>,
): boolean {
  if (opts.skipExpoExport === true) return false;
  if (cfg.expoExport === false) return false;
  if (cfg.expoExport === true) return true;
  return projectHasExpo();
}

function runExpoExport(outputDir: string) {
  const abs = resolve(process.cwd(), outputDir);
  process.stdout.write(`Running expo export → ${outputDir}…\n`);
  const result = spawnSync(
    'npx',
    ['expo', 'export', '--output-dir', abs],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
    },
  );
  if (result.error) {
    throw new Error(`Failed to run expo export: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`expo export failed (exit ${result.status ?? 1})`);
  }
}

async function runDeploy(opts: Record<string, string | boolean | undefined>) {
  const cfg = loadConfig();
  const exportOnly = opts.exportOnly === true;
  const skipExport = opts.skipExport === true;
  const token = resolveToken({
    token: typeof opts.token === 'string' ? opts.token : undefined,
    profile: typeof opts.profile === 'string' ? opts.profile : undefined,
  });
  const appId =
    (typeof opts.app === 'string' ? opts.app : undefined) ??
    cfg.appId ??
    env('RND_APP_ID', 'my-app');
  const version =
    (typeof opts.version === 'string' ? opts.version : undefined) ?? defaultVersion();
  const memo = typeof opts.memo === 'string' ? opts.memo : '';
  const sdk = typeof opts.sdk === 'string' ? opts.sdk : undefined;
  const apiUrl =
    (typeof opts.apiUrl === 'string' ? opts.apiUrl : undefined) ??
    cfg.apiUrl ??
    env('RND_API_URL');
  const bundleId =
    (typeof opts.bundleId === 'string' ? opts.bundleId : undefined) ??
    cfg.bundleId ??
    process.env.RND_BUNDLE_ID;

  let uploaded = 0;

  if (!exportOnly) {
    const file = resolveArtifact(
      cfg,
      typeof opts.platform === 'string' ? opts.platform : undefined,
      typeof opts.file === 'string' ? opts.file : undefined,
      /* required */ Boolean(opts.file || opts.platform || skipExport),
    );
    if (file) {
      await deployFile({
        file,
        appId,
        platform: typeof opts.platform === 'string' ? opts.platform : undefined,
        version,
        memo,
        sdk,
        bundleId,
        apiUrl,
        token,
      });
      uploaded += 1;
    } else {
      process.stdout.write('No install artifact found — skipping IPA/APK upload.\n');
    }
  }

  if (!skipExport) {
    const exportOpt = exportOnly ? (opts.export ?? true) : opts.export;
    const dirPath = exportDirPath(cfg, exportOpt);
    if (shouldRunExpoExport(cfg, opts)) {
      runExpoExport(dirPath);
    }

    const dir = resolveExportDir(
      cfg,
      exportOpt,
      /* required */ exportOnly || shouldRunExpoExport(cfg, opts) || typeof opts.export === 'string',
    );
    if (dir) {
      await deployExport({
        dir,
        appId,
        version,
        memo,
        sdk,
        apiUrl,
        token,
      });
      uploaded += 1;
    } else if (!exportOnly) {
      process.stdout.write(
        'No sandbox export — skipping QR test upload.\n' +
          '(Expo project: deploy runs `expo export` by default. Or set expoExport: true in rnd.config.json)\n',
      );
    }
  }

  if (uploaded === 0) {
    throw new Error(
      'Nothing to deploy. Need at least one of:\n' +
        '  • IPA/APK (artifact in rnd.config.json or -f)\n' +
        '  • Expo export (auto via `expo export`, or an existing --export dir)',
    );
  }
}

addDeployOptions(
  program
    .command('deploy')
    .description(
      'Upload IPA/APK and sandbox QR export (runs `expo export` by default in Expo apps)',
    ),
).action(async (opts) => {
  await runDeploy(opts);
});

addDeployOptions(
  program.command('upload').description('Alias of `rnd deploy`'),
).action(async (opts) => {
  await runDeploy(opts);
});

program
  .command('init')
  .description('Create rnd.config.json from package.json / app.json (safe: no overwrite)')
  .option('--force', 'Overwrite existing rnd.config.json')
  .option('--api-url <url>', 'Console base URL to write into config')
  .option('--cwd <path>', 'Project root (default: current directory)')
  .action((opts: { force?: boolean; apiUrl?: string; cwd?: string }) => {
    const cwd = resolve(opts.cwd ?? resolveConsumerRoot(process.cwd()));
    const result = scaffoldRndConfig({
      cwd,
      force: Boolean(opts.force),
      apiUrl: opts.apiUrl,
    });
    if (result.created) {
      process.stdout.write(
        `Created ${result.path}\n` +
          `Edit apiUrl (replace YOUR_CONSOLE_URL), then:\n` +
          `  npx rnd token add\n` +
          `  npm run build\n` +
          `  npx rnd deploy -m "메모"\n`,
      );
      return;
    }
    process.stdout.write(
      `Skipped: ${result.reason ?? 'unknown'}${result.path ? ` (${result.path})` : ''}\n`,
    );
  });

const tokenCmd = program
  .command('token')
  .description('Manage locally saved API tokens (~/.rnd/credentials)');

tokenCmd
  .command('add')
  .description('Save an API token locally (like `ait token add`)')
  .option('--api-key <token>', 'API token value')
  .argument('[profile]', 'Profile name', 'default')
  .action(async (profile: string, opts: { apiKey?: string }) => {
    let token = opts.apiKey?.trim();
    if (!token) {
      const rl = createInterface({ input, output });
      token = (await rl.question('API token: ')).trim();
      rl.close();
    }
    if (!token) throw new Error('Empty token');
    addToken(profile || 'default', token);
    process.stdout.write(`Saved profile "${profile || 'default'}" → ${credentialsPath()}\n`);
  });

tokenCmd
  .command('remove')
  .description('Remove a saved profile')
  .argument('[profile]', 'Profile name', 'default')
  .action((profile: string) => {
    const ok = removeToken(profile || 'default');
    if (!ok) {
      process.stdout.write(`Profile "${profile}" not found.\n`);
      return;
    }
    process.stdout.write(`Removed profile "${profile}".\n`);
  });

tokenCmd
  .command('list')
  .description('List saved profile names (tokens are not printed)')
  .action(() => {
    const data = loadCredentials();
    const names = Object.keys(data);
    if (names.length === 0) {
      process.stdout.write(`No profiles in ${credentialsPath()}\n`);
      return;
    }
    for (const name of names) {
      process.stdout.write(`${name}\n`);
    }
  });

program
  .command('open')
  .description('Print the console URL')
  .option('--api-url <url>', 'Console base')
  .action((opts) => {
    const cfg = loadConfig();
    const url =
      opts.apiUrl ?? cfg.apiUrl ?? process.env.RND_API_URL ?? 'http://localhost:3000';
    process.stdout.write(`${url.replace(/\/$/, '')}/\n`);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
