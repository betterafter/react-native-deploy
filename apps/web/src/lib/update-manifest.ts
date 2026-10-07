import { NextResponse } from 'next/server';
import type { ExportManifest, UpdatePlatformBundle } from '@rnd/shared';

export function updateManifestResponse(opts: {
  protocolVersion: number;
  runtimeVersion: string;
  currentUpdateId: string | null;
  exported: ExportManifest;
  platformBundle: UpdatePlatformBundle;
}) {
  const expoConfig = opts.exported.expoConfig ?? {
    name: 'sandbox',
    slug: 'sandbox',
    sdkVersion: '57.0.0',
  };
  const manifest = {
    id: opts.exported.id,
    createdAt: opts.exported.createdAt,
    runtimeVersion: opts.runtimeVersion,
    launchAsset: opts.platformBundle.launchAsset,
    assets: opts.platformBundle.assets,
    metadata: {},
    extra: {
      expoClient: expoConfig,
      expoConfig,
    },
  };

  if (opts.protocolVersion === 0) {
    return NextResponse.json(manifest, {
      headers: {
        'expo-protocol-version': '0',
        'expo-sfv-version': '0',
        'cache-control': 'private, max-age=0',
      },
    });
  }

  if (opts.currentUpdateId === manifest.id) {
    return multipart(1, [{ name: 'directive', body: JSON.stringify({ type: 'noUpdateAvailable' }) }]);
  }

  return multipart(1, [
    { name: 'manifest', body: JSON.stringify(manifest) },
    { name: 'extensions', body: JSON.stringify({ assetRequestHeaders: {} }) },
  ]);
}

function multipart(protocol: number, parts: { name: string; body: string }[]) {
  const boundary = `rndboundary${crypto.randomUUID().replace(/-/g, '')}`;
  const body =
    parts
      .map(
        (part) =>
          `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${part.body}\r\n`,
      )
      .join('') + `--${boundary}--\r\n`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      'expo-protocol-version': String(protocol),
      'expo-sfv-version': '0',
      'cache-control': 'private, max-age=0',
      'content-type': `multipart/mixed; boundary=${boundary}`,
    },
  });
}
