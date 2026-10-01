import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getBuild } from '@/lib/r2';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const appId = req.nextUrl.searchParams.get('appId');
  const id = req.nextUrl.searchParams.get('id');
  if (!appId || !id) {
    return NextResponse.json({ error: 'appId and id required' }, { status: 400 });
  }
  const build = await getBuild(appId, id);
  if (!build) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  const png = await QRCode.toBuffer(build.installUrl, {
    type: 'png',
    width: 280,
    margin: 2,
  });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=60',
    },
  });
}
