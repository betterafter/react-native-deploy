#!/usr/bin/env node
import { Command } from 'commander';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';

type Platform = 'ios' | 'android';

type RndConfig = {
  appId?: string;
  bundleId?: string;
  apiUrl?: string;
  artifact?: {
    ios?: string;
    android?: string;
  };
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
    .option('--token <token>', 'Deploy API token');
}

async function runDeploy(opts: Record<string, string | undefined>) {
  const cfg = loadConfig();
  const platform = opts.platform as Platform | undefined;
  const fileFromConfig =
    platform === 'android'
      ? cfg.artifact?.android
      : platform === 'ios'
        ? cfg.artifact?.ios
        : cfg.artifact?.ios || cfg.artifact?.android;

  const file = opts.file ?? fileFromConfig;
  if (!file) {
    throw new Error(
      'No artifact. Run your app build first, then either:\n' +
        '  npx rnd deploy -f ./path/to/app.ipa\n' +
        'or set artifact.ios / artifact.android in rnd.config.json',
    );
  }

  await deployFile({
    file,
    appId: opts.app ?? cfg.appId ?? env('RND_APP_ID', 'my-app'),
    platform: opts.platform,
    version: opts.version,
    memo: opts.memo,
    sdk: opts.sdk,
    bundleId: opts.bundleId ?? cfg.bundleId ?? process.env.RND_BUNDLE_ID,
    apiUrl: opts.apiUrl ?? cfg.apiUrl ?? env('RND_API_URL'),
    token: opts.token ?? env('RND_API_TOKEN'),
  });
}

addDeployOptions(
  program
    .command('deploy')
    .description('Upload the built IPA/APK to your release console (ait deploy equivalent)'),
).action(async (opts) => {
  await runDeploy(opts);
});

// Alias kept for older docs
addDeployOptions(
  program.command('upload').description('Alias of `rnd deploy`'),
).action(async (opts) => {
  await runDeploy(opts);
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
