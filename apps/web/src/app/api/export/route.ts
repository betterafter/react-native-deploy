import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { assertDeployToken, createPresignedUpload, publicUrl } from '@/lib/r2';

export const runtime = 'nodejs';

function safeAppId(appId: string): string | null {
  const trimmed = appId.trim();
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('..')) {
    return null;
  }
  return trimmed;
}

function safeRelative(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((part) => part === '' || part === '..')) {
    return null;
  }
  return normalized;
}

export async function POST(req: NextRequest) {
  try {
    assertDeployToken(req.headers.get('authorization'));
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const body = (await req.json()) as {
    appId?: string;
    files?: { path?: string; contentType?: string }[];
  };
  const appId = body.appId ? safeAppId(body.appId) : null;
  if (!appId || !body.files?.length) {
    return NextResponse.json({ error: 'appId and files required' }, { status: 400 });
  }
  if (body.files.length > 2000) {
    return NextResponse.json({ error: 'too many files' }, { status: 400 });
  }

  const buildId = randomUUID();
  const files = [];
  for (const file of body.files) {
    const rel = file.path ? safeRelative(file.path) : null;
    if (!rel) {
      return NextResponse.json({ error: `invalid path: ${file.path ?? ''}` }, { status: 400 });
    }
    const key = `apps/${appId}/builds/${buildId}/export/${rel}`;
    const contentType = file.contentType || 'application/octet-stream';
    const uploadUrl = await createPresignedUpload(key, contentType);
    files.push({ path: rel, uploadUrl, publicUrl: publicUrl(key) });
  }

  return NextResponse.json({ buildId, files });
}
