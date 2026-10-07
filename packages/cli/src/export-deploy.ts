import { createHash, randomUUID } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, extname, join, relative, resolve } from 'node:path';
import { normalizeBaseUrl } from './url.js';

type UpdateAsset = {
  hash: string;
  key: string;
  contentType: string;
  fileExtension?: string;
  url: string;
};

type ExpoMetadata = {
  fileMetadata?: {
    ios?: { bundle?: string; assets?: { path: string; ext: string }[] };
    android?: { bundle?: string; assets?: { path: string; ext: string }[] };
  };
};

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  json: 'application/json',
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  wav: 'audio/wav',
  hbc: 'application/javascript',
  js: 'application/javascript',
  bundle: 'application/javascript',
  txt: 'text/plain',
};

function contentTypeFor(filePath: string): string {
  const ext = extname(filePath).slice(1).toLowerCase();
  return MIME[ext] ?? 'application/octet-stream';
}

function posixRelative(root: string, file: string): string {
  return relative(root, file).split('\\').join('/');
}

async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(current: string) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.DS_Store' || entry.name === 'node_modules') continue;
      const abs = join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else if (!entry.name.endsWith('.map')) {
        out.push(abs);
      }
    }
  }
  await walk(root);
  return out;
}

async function api(baseUrl: string, token: string, path: string, init?: RequestInit) {
  const root = normalizeBaseUrl(baseUrl);
  const p = path.startsWith('/') ? path : `/${path}`;
  return fetch(`${root}${p}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
}

function assetFrom(bytes: Buffer, url: string, launch: boolean, ext?: string): UpdateAsset {
  const asset: UpdateAsset = {
    hash: createHash('sha256').update(bytes).digest('base64url'),
    key: createHash('md5').update(bytes).digest('hex'),
    contentType: launch ? 'application/javascript' : contentTypeFor(`file.${ext ?? 'bin'}`),
    url,
  };
  if (!launch && ext) asset.fileExtension = `.${ext.replace(/^\./, '')}`;
  return asset;
}

export async function deployExport(opts: {
  dir: string;
  appId: string;
  version: string;
  memo: string;
  sdk?: string;
  apiUrl: string;
  token: string;
}) {
  const root = resolve(opts.dir);
  const rootStat = await stat(root).catch(() => null);
  if (!rootStat?.isDirectory()) {
    throw new Error(`Export directory not found: ${root}\nRun \`npx expo export\` first, then pass that directory.`);
  }

  const metadataPath = join(root, 'metadata.json');
  const metadataRaw = await readFile(metadataPath, 'utf8').catch(() => null);
  if (!metadataRaw) {
    throw new Error(`No metadata.json in ${root}. Run \`npx expo export\` and pass its output directory.`);
  }
  const metadata = JSON.parse(metadataRaw) as ExpoMetadata;
  const platforms = (['android', 'ios'] as const).filter((platform) => metadata.fileMetadata?.[platform]?.bundle);
  if (platforms.length === 0) {
    throw new Error('metadata.json has no android or ios bundle. Export with `npx expo export`.');
  }

  const files = await listFiles(root);
  process.stdout.write(`Uploading Expo export (${files.length} files) for sandbox QR…\n`);

  const presignRes = await api(opts.apiUrl, opts.token, '/api/export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appId: opts.appId,
      files: files.map((file) => ({
        path: posixRelative(root, file),
        contentType: contentTypeFor(file),
      })),
    }),
  });
  if (!presignRes.ok) {
    throw new Error(`export presign failed: ${presignRes.status} ${await presignRes.text()}`);
  }
  const presign = (await presignRes.json()) as {
    buildId: string;
    files: { path: string; uploadUrl: string; publicUrl: string }[];
  };
  const byPath = new Map(presign.files.map((file) => [file.path, file]));

  let fileSize = 0;
  const uploaded = new Map<string, { url: string; bytes: Buffer }>();
  for (const file of files) {
    const rel = posixRelative(root, file);
    const target = byPath.get(rel);
    if (!target) throw new Error(`Missing upload URL for ${rel}`);
    const bytes = await readFile(file);
    fileSize += bytes.length;
    const put = await fetch(target.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': contentTypeFor(file),
        'Content-Length': String(bytes.length),
      },
      body: bytes,
    });
    if (!put.ok) {
      throw new Error(`upload failed for ${rel}: ${put.status} ${await put.text()}`);
    }
    uploaded.set(rel, { url: target.publicUrl, bytes });
    process.stdout.write(`  ${rel}\n`);
  }

  const expoConfigRaw = await readFile(join(root, 'expoConfig.json'), 'utf8').catch(() => null);
  const expoConfig = expoConfigRaw ? (JSON.parse(expoConfigRaw) as Record<string, unknown>) : null;

  function bundleFor(platform: 'ios' | 'android') {
    const meta = metadata.fileMetadata?.[platform];
    if (!meta?.bundle) return undefined;
    const launchRel = meta.bundle.replace(/^\.\//, '');
    const launch = uploaded.get(launchRel);
    if (!launch) throw new Error(`Bundle file missing from export: ${launchRel}`);
    const assets = (meta.assets ?? []).map((asset) => {
      const rel = asset.path.replace(/^\.\//, '');
      const file = uploaded.get(rel);
      if (!file) throw new Error(`Asset missing from export: ${rel}`);
      return assetFrom(file.bytes, file.url, false, asset.ext);
    });
    return {
      launchAsset: assetFrom(launch.bytes, launch.url, true),
      assets,
    };
  }

  const registerRes = await api(opts.apiUrl, opts.token, '/api/builds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: presign.buildId,
      appId: opts.appId,
      platform: 'sandbox',
      version: opts.version,
      memo: opts.memo,
      sdkVersion: opts.sdk,
      artifactKey: `apps/${opts.appId}/builds/${presign.buildId}/export`,
      artifactUrl: '',
      fileName: basename(root),
      fileSize,
      exportManifest: {
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        platforms: {
          android: bundleFor('android'),
          ios: bundleFor('ios'),
        },
        expoConfig,
      },
    }),
  });
  if (!registerRes.ok) {
    throw new Error(`register failed: ${registerRes.status} ${await registerRes.text()}`);
  }
  const build = (await registerRes.json()) as { id: string; consoleUrl: string; installUrl: string };
  process.stdout.write(`\nDone.\n`);
  process.stdout.write(`Build: ${build.id}\n`);
  process.stdout.write(`QR test: ${build.installUrl}\n`);
  process.stdout.write(`Console: ${build.consoleUrl}\n`);
}
