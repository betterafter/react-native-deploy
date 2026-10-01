import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  assertDeployToken,
  buildObjectKey,
  createPresignedUpload,
  publicUrl,
} from '@/lib/r2';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    assertDeployToken(req.headers.get('authorization'));
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body = (await req.json()) as {
    appId: string;
    platform: 'ios' | 'android';
    version: string;
    fileName: string;
    contentType: string;
  };

  if (!body.appId || !body.fileName) {
    return NextResponse.json({ error: 'appId and fileName required' }, { status: 400 });
  }

  const buildId = randomUUID();
  const artifactKey = buildObjectKey(body.appId, buildId, body.fileName);
  const uploadUrl = await createPresignedUpload(
    artifactKey,
    body.contentType || 'application/octet-stream',
  );

  return NextResponse.json({
    buildId,
    uploadUrl,
    artifactKey,
    artifactUrl: publicUrl(artifactKey),
  });
}
