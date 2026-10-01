import { NextRequest, NextResponse } from 'next/server';
import type { BuildRecord } from '@rnd/shared';
import { iosManifestXml, itmsServicesUrl } from '@/lib/ios-manifest';
import {
  assertDeployToken,
  listBuilds,
  publicUrl,
  putText,
  saveBuild,
} from '@/lib/r2';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const appId =
    req.nextUrl.searchParams.get('appId') ||
    process.env.DEFAULT_APP_ID ||
    'my-app';
  try {
    const builds = await listBuilds(appId);
    return NextResponse.json({ appId, builds });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'list failed';
    return NextResponse.json({ error: message, builds: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    assertDeployToken(req.headers.get('authorization'));
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body = (await req.json()) as {
    id: string;
    appId: string;
    platform: 'ios' | 'android';
    version: string;
    memo?: string;
    sdkVersion?: string;
    artifactKey: string;
    artifactUrl: string;
    fileName: string;
    fileSize?: number;
    bundleId?: string;
  };

  const base = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(
    /\/$/,
    '',
  );

  let manifestUrl: string | null = null;
  let installUrl = body.artifactUrl;

  if (body.platform === 'ios') {
    const bundleId = body.bundleId || process.env.DEFAULT_IOS_BUNDLE_ID;
    if (!bundleId) {
      return NextResponse.json(
        { error: 'bundleId required for iOS (pass --bundle-id or DEFAULT_IOS_BUNDLE_ID)' },
        { status: 400 },
      );
    }
    const manifestKey = `apps/${body.appId}/builds/${body.id}/manifest.plist`;
    const xml = iosManifestXml({
      artifactUrl: body.artifactUrl,
      bundleId,
      title: `${body.appId} ${body.version}`,
      version: body.version,
    });
    await putText(manifestKey, xml, 'application/xml');
    manifestUrl = publicUrl(manifestKey);
    installUrl = itmsServicesUrl(manifestUrl);
  }

  const build: BuildRecord = {
    id: body.id,
    appId: body.appId,
    platform: body.platform,
    version: body.version,
    sdkVersion: body.sdkVersion,
    status: 'ready',
    memo: body.memo ?? '',
    createdAt: new Date().toISOString(),
    releasedAt: null,
    artifactKey: body.artifactKey,
    artifactUrl: body.artifactUrl,
    manifestUrl,
    installUrl,
    fileName: body.fileName,
    fileSize: body.fileSize,
  };

  await saveBuild(build);

  return NextResponse.json({
    ...build,
    consoleUrl: `${base}/?appId=${encodeURIComponent(body.appId)}`,
  });
}
