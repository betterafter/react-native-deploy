import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';

export type BuildResult = {
  androidApk?: string;
  iosIpa?: string;
};

function run(command: string, args: string[], cwd: string): void {
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

function hasExpo(cwd: string): boolean {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) return false;
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(pkg.dependencies?.expo || pkg.devDependencies?.expo);
  } catch {
    return false;
  }
}

function findReleaseApk(androidDir: string): string | null {
  const releaseDir = join(androidDir, 'app/build/outputs/apk/release');
  if (!existsSync(releaseDir)) return null;
  const apks = readdirSync(releaseDir)
    .filter((f) => f.endsWith('.apk'))
    .map((f) => join(releaseDir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return apks[0] ?? null;
}

/**
 * Universal local build for QA:
 * - Expo: prebuild Android if needed, then assembleRelease
 * - Bare RN: assembleRelease when android/ exists
 * Default install artifact = Android APK (works everywhere for QR install).
 */
export function runRndBuild(opts: {
  cwd?: string;
  platform?: 'android' | 'ios' | 'all';
}): BuildResult {
  const cwd = opts.cwd ?? process.cwd();
  const platform = opts.platform ?? 'android';
  const out: BuildResult = {};

  if (platform === 'android' || platform === 'all') {
    const androidDir = join(cwd, 'android');
    if (!existsSync(androidDir) && hasExpo(cwd)) {
      process.stdout.write('No android/ folder — running expo prebuild…\n');
      run(
        'npx',
        ['expo', 'prebuild', '--platform', 'android', '--no-install'],
        cwd,
      );
    }
    if (!existsSync(androidDir)) {
      throw new Error(
        'No android/ project. Expo apps need a successful `expo prebuild`, ' +
          'or add a native android/ folder.',
      );
    }

    const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    process.stdout.write('Building Android release APK…\n');
    run(
      gradlew,
      ['assembleRelease', '-PreactNativeArchitectures=arm64-v8a'],
      androidDir,
    );

    const apk = findReleaseApk(androidDir);
    if (!apk) {
      throw new Error(
        'assembleRelease finished but no APK found under android/app/build/outputs/apk/release',
      );
    }

    const stable = join(
      cwd,
      'android/app/build/outputs/apk/release/app-release.apk',
    );
    if (resolve(apk) !== resolve(stable)) {
      mkdirSync(join(cwd, 'android/app/build/outputs/apk/release'), {
        recursive: true,
      });
      copyFileSync(apk, stable);
      out.androidApk = stable;
    } else {
      out.androidApk = apk;
    }
    process.stdout.write(`Android APK → ${out.androidApk}\n`);
  }

  if (platform === 'ios' || platform === 'all') {
    if (process.platform !== 'darwin') {
      process.stdout.write('Skipping iOS build (not macOS).\n');
    } else {
      process.stdout.write(
        'iOS IPA: use Xcode Archive or EAS, then set artifact.ios — ' +
          '`rnd build` ships Android APK by default for universal install QR.\n',
      );
    }
  }

  return out;
}
