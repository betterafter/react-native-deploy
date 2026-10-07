#!/usr/bin/env node
import { Command } from 'commander';
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

type Platform = 'ios' | 'android';

type RndConfig = {
  appId?: string;
  bundleId?: string;
  apiUrl?: string;
  artifact?: {
    ios?: string;
    android?: string;
  };
  export?: string;
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
    .option('--skip-export', 'Upload IPA/APK only (skip sandbox export)');
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

function resolveExportDir(
  cfg: RndConfig,
  exportOpt: string | boolean | undefined,
): string | null {
  if (exportOpt === false) return null;
  const dir =
    typeof exportOpt === 'string' ? exportOpt : (cfg.export ?? './dist');
  const abs = resolve(process.cwd(), dir);
  if (existsSync(abs)) return dir;
  if (typeof exportOpt === 'string' || exportOpt === true) {
    throw new Error(
      `Export directory not found: ${dir}\n` +
        'Run `npx expo export` first, or pass --export ./path/to/dist.',
    );
  }
  return null;
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
    const dir = resolveExportDir(cfg, exportOnly ? opts.export ?? true : opts.export);
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
        'No Expo export directory found — skipping sandbox QR upload.\n' +
          '(Run `npx expo export` then deploy again, or pass --export ./dist)\n',
      );
    }
  }

  if (uploaded === 0) {
    throw new Error(
      'Nothing to deploy. Need at least one of:\n' +
        '  • IPA/APK (artifact in rnd.config.json or -f)\n' +
        '  • Expo export dir (./dist, config.export, or --export)',
    );
  }
}

addDeployOptions(
  program
    .command('deploy')
    .description(
      'Upload install file (IPA/APK) and Expo export (sandbox QR) when both are present',
    ),
).action(async (opts) => {
  await runDeploy(opts);
});

addDeployOptions(
  program.command('upload').description('Alias of `rnd deploy`'),
).action(async (opts) => {
  await runDeploy(opts);
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
