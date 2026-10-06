import { NextResponse } from 'next/server';
import { listApps } from '@/lib/r2';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const apps = await listApps();
    return NextResponse.json({ apps });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'list failed';
    return NextResponse.json({ error: message, apps: [] }, { status: 500 });
  }
}
