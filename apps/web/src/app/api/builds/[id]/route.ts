import { NextRequest, NextResponse } from 'next/server';
import type { BuildStatus } from '@rnd/shared';
import { assertDeployToken, updateBuild } from '@/lib/r2';

export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    assertDeployToken(req.headers.get('authorization'));
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }

  const { id } = await ctx.params;
  const body = (await req.json()) as {
    appId: string;
    memo?: string;
    status?: BuildStatus;
    releasedAt?: string | null;
  };

  if (!body.appId) {
    return NextResponse.json({ error: 'appId required' }, { status: 400 });
  }

  const updated = await updateBuild(body.appId, id, {
    memo: body.memo,
    status: body.status,
    releasedAt: body.releasedAt,
  });

  if (!updated) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }
  return NextResponse.json(updated);
}
