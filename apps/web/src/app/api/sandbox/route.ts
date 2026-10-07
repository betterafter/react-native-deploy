import { NextResponse } from 'next/server';
import { sandboxFromUrl } from '@/lib/sandbox';

export const runtime = 'nodejs';

export function GET() {
  const sandbox = sandboxFromUrl(process.env.SANDBOX_APP_URL);
  return NextResponse.json({ sandbox });
}
