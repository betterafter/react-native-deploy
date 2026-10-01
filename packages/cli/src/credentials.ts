import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export type CredentialsFile = {
  /** profile name → API token */
  [profile: string]: string;
};

const DIR = join(homedir(), '.rnd');
const FILE = join(DIR, 'credentials');

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true, mode: 0o700 });
}

export function credentialsPath() {
  return FILE;
}

export function loadCredentials(): CredentialsFile {
  if (!existsSync(FILE)) return {};
  try {
    const raw = JSON.parse(readFileSync(FILE, 'utf8')) as CredentialsFile;
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

export function saveCredentials(data: CredentialsFile) {
  ensureDir();
  writeFileSync(FILE, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(FILE, 0o600);
  } catch {
    // ignore on platforms without chmod semantics
  }
}

export function addToken(profile: string, token: string) {
  const data = loadCredentials();
  data[profile] = token.trim();
  saveCredentials(data);
}

export function removeToken(profile: string) {
  const data = loadCredentials();
  if (!(profile in data)) return false;
  delete data[profile];
  saveCredentials(data);
  return true;
}

/** Resolve token: CLI --token > env > ~/.rnd/credentials profile */
export function resolveToken(opts: {
  token?: string;
  profile?: string;
}): string {
  if (opts.token?.trim()) return opts.token.trim();
  if (process.env.RND_API_TOKEN?.trim()) return process.env.RND_API_TOKEN.trim();
  const profile = opts.profile || process.env.RND_PROFILE || 'default';
  const data = loadCredentials();
  const fromFile = data[profile];
  if (fromFile?.trim()) return fromFile.trim();
  throw new Error(
    `No API token. Run:\n  npx rnd token add\n` +
      `or set RND_API_TOKEN / pass --token.\n` +
      `(looked for profile "${profile}" in ${FILE})`,
  );
}
