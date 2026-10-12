import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { loadConfigFile, saveConfigFile } from './config-io.js';

export type PackageManager = 'pnpm' | 'yarn' | 'npm';

export type ResolvedProject = {
  /** Directory that holds rnd.config.json, or the folder the command was run from. */
  configDir: string;
  /** Expo app, or a bare React Native app with android/. */
  appDir: string;
  workspaceRoot: string;
  packageManager: PackageManager;
  hasExpo: boolean;
};

type PackageJson = {
  name?: string;
  packageManager?: string;
  engines?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
};

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.pnpm',
  'dist',
  'build',
  'android',
  'ios',
]);

function readPkg(dir: string): PackageJson | null {
  const path = join(dir, 'package.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
  } catch {
    return null;
  }
}

function depsOf(pkg: PackageJson | null): Record<string, string> {
  return { ...(pkg?.dependencies ?? {}), ...(pkg?.devDependencies ?? {}) };
}

export function toPosix(path: string): string {
  return path.split('\\').join('/');
}

function walkUp(start: string, found: (dir: string) => boolean): string | null {
  let dir = resolve(start);
  for (;;) {
    if (found(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function childDirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !SKIP_DIRS.has(entry.name))
    .map((entry) => join(dir, entry.name));
}

/** Expand workspace globs like `apps/*` and `packages/**`. */
export function expandWorkspacePattern(root: string, pattern: string): string[] {
  const parts = pattern.split('/').filter((part) => part && part !== '.');
  let dirs = [resolve(root)];
  for (const part of parts) {
    const next: string[] = [];
    for (const dir of dirs) {
      if (part === '*') {
        next.push(...childDirs(dir));
      } else if (part === '**') {
        next.push(dir, ...walkAll(dir));
      } else {
        const candidate = join(dir, part);
        if (existsSync(candidate) && statSync(candidate).isDirectory()) next.push(candidate);
      }
    }
    dirs = next;
  }
  return dirs.filter((dir) => existsSync(join(dir, 'package.json')));
}

function walkAll(dir: string): string[] {
  const out: string[] = [];
  for (const child of childDirs(dir)) {
    out.push(child, ...walkAll(child));
  }
  return out;
}

function workspacePatterns(dir: string): string[] | null {
  const yamlPath = join(dir, 'pnpm-workspace.yaml');
  if (existsSync(yamlPath)) {
    const patterns: string[] = [];
    let inPackages = false;
    for (const line of readFileSync(yamlPath, 'utf8').split(/\r?\n/)) {
      if (/^packages:\s*$/.test(line)) {
        inPackages = true;
        continue;
      }
      if (!inPackages) continue;
      if (/^\S/.test(line)) break;
      const match = line.match(/^\s+-\s+['"]?([^'"#]+?)['"]?\s*(?:#.*)?$/);
      if (match) patterns.push(match[1].trim());
    }
    return patterns;
  }

  const workspaces = readPkg(dir)?.workspaces;
  if (Array.isArray(workspaces)) return workspaces;
  if (workspaces && Array.isArray(workspaces.packages)) return workspaces.packages;
  return null;
}

function workspaceRootOf(start: string): string {
  return (
    walkUp(start, (dir) => workspacePatterns(dir) !== null) ?? resolve(start)
  );
}

export function detectPackageManager(root: string): PackageManager {
  const declared = readPkg(root)?.packageManager ?? '';
  if (declared.startsWith('pnpm')) return 'pnpm';
  if (declared.startsWith('yarn')) return 'yarn';
  if (declared.startsWith('npm')) return 'npm';
  if (
    existsSync(join(root, 'pnpm-lock.yaml')) ||
    existsSync(join(root, 'pnpm-workspace.yaml'))
  ) {
    return 'pnpm';
  }
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/** Expo app, or bare React Native that already has an android/ project. */
export function appKind(dir: string): 'expo' | 'bare' | null {
  const deps = depsOf(readPkg(dir));
  if (deps.expo) return 'expo';
  const android =
    existsSync(join(dir, 'android/gradlew')) ||
    existsSync(join(dir, 'android/gradlew.bat'));
  if (deps['react-native'] && android) return 'bare';
  return null;
}

function listWorkspaceApps(root: string): string[] {
  const patterns = workspacePatterns(root);
  if (!patterns) return [];
  const seen = new Set<string>();
  const apps: string[] = [];
  for (const pattern of patterns) {
    for (const dir of expandWorkspacePattern(root, pattern)) {
      const abs = resolve(dir);
      if (seen.has(abs) || !appKind(abs)) continue;
      seen.add(abs);
      apps.push(abs);
    }
  }
  return apps;
}

function configDirOf(start: string): string {
  return walkUp(start, (dir) => existsSync(join(dir, 'rnd.config.json'))) ?? resolve(start);
}

/**
 * Pick the app `rnd build` / `rnd deploy` should use.
 * A monorepo root is not required to be the Expo app itself.
 */
export function resolveProject(
  start: string,
  opts?: { appDir?: string },
): ResolvedProject {
  const invocation = resolve(start);
  const configDir = configDirOf(opts?.appDir ?? invocation);
  const workspaceRoot = workspaceRootOf(opts?.appDir ?? invocation);
  const packageManager = detectPackageManager(workspaceRoot);

  if (opts?.appDir) {
    const appDir = resolve(opts.appDir);
    if (!existsSync(appDir)) {
      throw new Error(`App directory not found: ${appDir}`);
    }
    return {
      configDir,
      appDir,
      workspaceRoot,
      packageManager,
      hasExpo: appKind(appDir) === 'expo' || Boolean(depsOf(readPkg(appDir)).expo),
    };
  }

  const configured = loadConfigFile(configDir).appDir;
  if (configured) {
    const appDir = resolve(configDir, configured);
    if (!existsSync(appDir)) {
      throw new Error(
        `appDir in rnd.config.json does not exist: ${configured}\nLooked in ${appDir}`,
      );
    }
    return {
      configDir,
      appDir,
      workspaceRoot,
      packageManager,
      hasExpo: Boolean(depsOf(readPkg(appDir)).expo),
    };
  }

  if (appKind(invocation)) {
    return projectAt(invocation, configDir, workspaceRoot, packageManager);
  }

  const apps = listWorkspaceApps(workspaceRoot);
  if (apps.length === 1) {
    return projectAt(apps[0], configDir, workspaceRoot, packageManager);
  }
  if (apps.length > 1) {
    const lines = apps
      .map((dir) => `  ${toPosix(relative(configDir, dir)) || '.'}`)
      .join('\n');
    throw new Error(
      `Found ${apps.length} React Native apps. Set "appDir" in rnd.config.json to one of:\n${lines}`,
    );
  }

  throw new Error(
    'No Expo or React Native app found in this folder.\n' +
      'Run rnd from the app directory, pass --cwd, or set "appDir" in rnd.config.json.',
  );
}

function projectAt(
  appDir: string,
  configDir: string,
  workspaceRoot: string,
  packageManager: PackageManager,
): ResolvedProject {
  return {
    configDir,
    appDir,
    workspaceRoot,
    packageManager,
    hasExpo: Boolean(depsOf(readPkg(appDir)).expo),
  };
}

export function runCommand(command: string, args: string[], cwd: string): void {
  process.stdout.write(`$ ${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.error) {
    throw new Error(`${command} failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} exited with code ${result.status ?? 1}`);
  }
}

function moduleInstalled(appDir: string, name: string): boolean {
  try {
    createRequire(join(appDir, 'package.json')).resolve(`${name}/package.json`);
    return true;
  } catch {
    return false;
  }
}

type Version = [number, number, number];

function parseVersion(input: string): Version | null {
  const match = input.replace(/^v/, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

function compareVersion(a: Version, b: Version): number {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** Enough of node engines ranges to explain a mismatch. Unknown syntax does not block. */
export function nodeSatisfies(current: string, range: string): boolean {
  const orParts = range.split('||').map((part) => part.trim()).filter(Boolean);
  if (orParts.length === 0) return true;
  return orParts.some((part) => {
    if (part === '*' || part === 'x') return true;
    const tokens = part.split(/\s+/);
    return tokens.every((token) => satisfiesComparator(current, token));
  });
}

function satisfiesComparator(current: string, token: string): boolean {
  if (token === '*' || token === 'x') return true;
  const normalized = token.replace(/\.x$/i, '').replace(/\.x\./gi, '.');
  const bare = normalized.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (bare && !normalized.includes('.')) {
    return satisfiesComparator(current, `^${bare[1]}.0.0`);
  }
  if (/^\d+\.x$/i.test(token) || /^\d+$/.test(token)) {
    return satisfiesComparator(current, `^${token.replace(/\.x$/i, '')}.0.0`);
  }

  const match = normalized.match(/^(>=|<=|>|<|=|\^|~)?(\d+(?:\.\d+){0,2})$/);
  if (!match) return true;
  const op = match[1] ?? '=';
  const wanted = parseVersion(match[2]);
  const actual = parseVersion(current);
  if (!wanted || !actual) return true;
  const cmp = compareVersion(actual, wanted);
  if (op === '>=') return cmp >= 0;
  if (op === '>') return cmp > 0;
  if (op === '<=') return cmp <= 0;
  if (op === '<') return cmp < 0;
  if (op === '=') return cmp === 0;
  if (op === '~') {
    const upper: Version = [wanted[0], wanted[1] + 1, 0];
    return cmp >= 0 && compareVersion(actual, upper) < 0;
  }
  const upper: Version = [wanted[0] + 1, 0, 0];
  return cmp >= 0 && compareVersion(actual, upper) < 0;
}

function assertNodeForInstall(dir: string): void {
  const pkg = readPkg(dir);
  const range = pkg?.engines?.node;
  if (!range || nodeSatisfies(process.versions.node, range)) return;
  const name = pkg?.name ?? toPosix(dir);
  throw new Error(
    `This project requires Node.js ${range} (${name} package.json engines).\n` +
      `Current Node.js is v${process.versions.node}.\n` +
      `rnd itself runs on Node.js 20+, but this project's package manager does not.\n` +
      `Switch Node.js, then run the command again.`,
  );
}

export function ensureDependency(project: ResolvedProject, name: string): void {
  if (moduleInstalled(project.appDir, name)) return;
  assertNodeForInstall(project.workspaceRoot);
  assertNodeForInstall(project.appDir);
  process.stdout.write(
    `${name} is not installed. Running ${project.packageManager} install in ${project.workspaceRoot}…\n`,
  );
  const installArgs = project.packageManager === 'npm' ? ['install'] : ['install'];
  runCommand(project.packageManager, installArgs, project.workspaceRoot);
  if (!moduleInstalled(project.appDir, name)) {
    throw new Error(
      `${name} is listed in ${project.appDir} but is still not installed.\n` +
        `Run \`${project.packageManager} install\` in ${project.workspaceRoot}, then retry.`,
    );
  }
}

export function runExpo(project: ResolvedProject, args: string[]): void {
  ensureDependency(project, 'expo');
  if (project.packageManager === 'pnpm') {
    runCommand('pnpm', ['exec', 'expo', ...args], project.appDir);
    return;
  }
  if (project.packageManager === 'yarn') {
    runCommand('yarn', ['expo', ...args], project.appDir);
    return;
  }
  runCommand('npm', ['exec', '--', 'expo', ...args], project.appDir);
}

/** Point rnd.config.json at the app and the APK that was just built. */
export function rememberAndroidArtifact(project: ResolvedProject, apk: string): void {
  if (!existsSync(join(project.configDir, 'rnd.config.json'))) return;
  const cfg = loadConfigFile(project.configDir);
  const appDir = toPosix(relative(project.configDir, project.appDir)) || '.';
  const android = toPosix(relative(project.configDir, apk));
  saveConfigFile(
    {
      ...cfg,
      ...(appDir !== '.' ? { appDir } : {}),
      artifact: { ...cfg.artifact, android },
    },
    project.configDir,
  );
  process.stdout.write(`Updated rnd.config.json artifact.android → ${android}\n`);
}
