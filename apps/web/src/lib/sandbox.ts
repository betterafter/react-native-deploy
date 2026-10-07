export type SandboxApp = {
  name: string;
  url: string;
};

/** Banner label is the install-file name on R2, without the extension. */
export function sandboxFromUrl(raw: string | undefined): SandboxApp | null {
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
  if (!name) return null;

  return { name, url: parsed.toString() };
}
