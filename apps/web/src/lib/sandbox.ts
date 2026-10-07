export type SandboxPlatform = 'android' | 'ios';

export type SandboxLink = {
  name: string;
  url: string;
  platform: SandboxPlatform;
};

export type SandboxBanner = {
  name: string;
  android: SandboxLink | null;
  ios: SandboxLink | null;
};

function platformFromFile(file: string): SandboxPlatform | null {
  if (/\.ipa$/i.test(file)) return 'ios';
  if (/\.(apk|aab)$/i.test(file)) return 'android';
  return null;
}

/** Banner label is the install-file name on R2, without the extension. */
export function sandboxLinkFromUrl(
  raw: string | undefined,
  expected?: SandboxPlatform,
): SandboxLink | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;

  const file = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() ?? '');
  const name = file.replace(/\.(apk|ipa|aab)$/i, '').trim();
  const platform = platformFromFile(file);
  if (!name || !platform) return null;
  if (expected && platform !== expected) return null;

  return { name, url: parsed.toString(), platform };
}

export function sandboxBanner(input: {
  androidUrl?: string;
  iosUrl?: string;
  legacyUrl?: string;
}): SandboxBanner | null {
  let android = sandboxLinkFromUrl(input.androidUrl, 'android');
  let ios = sandboxLinkFromUrl(input.iosUrl, 'ios');

  if (!android && !ios) {
    const legacy = sandboxLinkFromUrl(input.legacyUrl);
    if (legacy?.platform === 'android') android = legacy;
    if (legacy?.platform === 'ios') ios = legacy;
  }

  if (!android && !ios) return null;
  return { name: android?.name || ios?.name || '', android, ios };
}
