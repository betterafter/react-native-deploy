import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type RndConfig = {
  appId?: string;
  bundleId?: string;
  apiUrl?: string;
  artifact?: {
    ios?: string;
    android?: string;
  };
  export?: string;
  expoExport?: boolean;
};

export function configPath(cwd = process.cwd()): string {
  return resolve(cwd, 'rnd.config.json');
}

export function loadConfigFile(cwd = process.cwd()): RndConfig {
  const path = configPath(cwd);
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as RndConfig;
  } catch {
    throw new Error(`Invalid rnd.config.json at ${path}`);
  }
}

export function saveConfigFile(cfg: RndConfig, cwd = process.cwd()): void {
  const path = configPath(cwd);
  writeFileSync(path, `${JSON.stringify(cfg, null, 2)}\n`, 'utf8');
}

export function isPlaceholderApiUrl(url: string | undefined): boolean {
  if (!url?.trim()) return true;
  return /YOUR_CONSOLE_URL/i.test(url);
}
