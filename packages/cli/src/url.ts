/**
 * Normalize console / API base URLs so developers can paste hostnames
 * without `https://` (common with Vercel domains).
 */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (!url) {
    throw new Error('Empty apiUrl. Set rnd.config.json apiUrl or RND_API_URL.');
  }

  // Placeholder left from init — fail with a clear message.
  if (/YOUR_CONSOLE_URL/i.test(url)) {
    throw new Error(
      'apiUrl is still a placeholder. Set rnd.config.json apiUrl to your console host, e.g. my-app.vercel.app',
    );
  }

  // localhost / 127.0.0.1 default to http
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(url)) {
    if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  } else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  try {
    // eslint-disable-next-line no-new
    new URL(url);
  } catch {
    throw new Error(
      `Invalid apiUrl: "${input}". Use a host like my-app.vercel.app or https://my-app.vercel.app`,
    );
  }

  return url.replace(/\/+$/, '');
}

/** @deprecated alias — prefer normalizeBaseUrl */
export const normalizeApiUrl = normalizeBaseUrl;
