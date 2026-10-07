import { NextRequest, NextResponse } from 'next/server';
import { getBuild } from '@/lib/r2';
import { updateManifestResponse } from '@/lib/update-manifest';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const appId = req.nextUrl.searchParams.get('appId');
  const id = req.nextUrl.searchParams.get('id');
  if (!appId || !id) {
    return NextResponse.json({ error: 'appId and id required' }, { status: 400 });
  }

  const build = await getBuild(appId, id);
  if (!build?.exportManifest) {
    return NextResponse.json({ error: 'sandbox export not found' }, { status: 404 });
  }

  const platformHeader = req.headers.get('expo-platform') ?? req.nextUrl.searchParams.get('platform');
  if (platformHeader !== 'ios' && platformHeader !== 'android') {
    return NextResponse.json({ error: 'expo-platform ios or android required' }, { status: 400 });
  }

  const platformBundle = build.exportManifest.platforms[platformHeader];
  if (!platformBundle) {
    return NextResponse.json({ error: `no ${platformHeader} bundle in this export` }, { status: 404 });
  }

  const protocolRaw = req.headers.get('expo-protocol-version');
  const protocolVersion = protocolRaw == null ? 1 : Number.parseInt(protocolRaw, 10);
  if (protocolVersion !== 0 && protocolVersion !== 1) {
    return NextResponse.json({ error: 'unsupported expo-protocol-version' }, { status: 400 });
  }

  return updateManifestResponse({
    protocolVersion,
    runtimeVersion: req.headers.get('expo-runtime-version') ?? '57.0.0',
    currentUpdateId: req.headers.get('expo-current-update-id'),
    exported: build.exportManifest,
    platformBundle,
  });
}
