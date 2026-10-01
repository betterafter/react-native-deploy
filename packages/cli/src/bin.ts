#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync, statSync } from 'node:fs';
import { basename, extname } from 'node:path';

type Platform = 'ios' | 'android';

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v == null || v === '') {
    throw new Error(`Missing env ${name}. Set it or pass a flag.`);
  }
  return v;
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

const program = new Command();
program
  .name('rnd')
  .description('react-native-deploy CLI — upload builds to your self-hosted console')
  .version('0.1.0');

program
  .command('upload')
  .description('Upload an IPA/APK and register it on the release console')
  .requiredOption('-f, --file <path>', 'Path to .ipa / .apk / .aab')
  .option('-a, --app <appId>', 'App id', process.env.RND_APP_ID)
  .option('-p, --platform <platform>', 'ios | android')
  .option('-v, --version <label>', 'Version label shown in the console')
  .option('-m, --memo <text>', 'Memo', '')
  .option('--sdk <version>', 'Optional SDK / RN version label')
  .option('--bundle-id <id>', 'iOS bundle id (for Ad Hoc manifest)', process.env.RND_BUNDLE_ID)
  .option('--api-url <url>', 'Console API base', process.env.RND_API_URL)
  .option('--token <token>', 'Deploy API token', process.env.RND_API_TOKEN)
  .action(async (opts) => {
    const apiUrl = opts.apiUrl ?? env('RND_API_URL');
    const token = opts.token ?? env('RND_API_TOKEN');
    const appId = opts.app ?? env('RND_APP_ID', 'my-app');
    const filePath = opts.file as string;
    const platform = detectPlatform(filePath, opts.platform);
    const version = (opts.version as string | undefined) ?? defaultVersion();
    const memo = (opts.memo as string) ?? '';
    const fileName = basename(filePath);
    const fileSize = statSync(filePath).size;
    const bytes = readFileSync(filePath);

    process.stdout.write(`Uploading ${fileName} (${platform}) as ${version}…\n`);

    const contentType =
      platform === 'ios'
        ? 'application/octet-stream'
        : fileName.endsWith('.aab')
          ? 'application/octet-stream'
          : 'application/vnd.android.package-archive';

    const presignRes = await api(apiUrl, token, '/api/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId,
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
      throw new Error(`R2 upload failed: ${put.status} ${await put.text()}`);
    }

    const registerRes = await api(apiUrl, token, '/api/builds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: presign.buildId,
        appId,
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
  });

program
  .command('open')
  .description('Print the console URL')
  .option('--api-url <url>', 'Console base', process.env.RND_API_URL)
  .action((opts) => {
    const url = opts.apiUrl ?? process.env.RND_API_URL ?? 'http://localhost:3000';
    process.stdout.write(`${url.replace(/\/$/, '')}/\n`);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
