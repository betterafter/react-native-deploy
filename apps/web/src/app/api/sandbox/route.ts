import { NextResponse } from 'next/server';
import { sandboxBanner } from '@/lib/sandbox';

export const runtime = 'nodejs';

export function GET() {
  const sandbox = sandboxBanner({
    androidUrl: process.env.SANDBOX_APP_ANDROID_URL,
    iosUrl: process.env.SANDBOX_APP_IOS_URL,
    legacyUrl: process.env.SANDBOX_APP_URL,
  });
  return NextResponse.json({ sandbox });
}
