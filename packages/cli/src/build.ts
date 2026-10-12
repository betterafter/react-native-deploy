import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import {
  rememberAndroidArtifact,
  resolveProject,
  runCommand,
  runExpo,
} from './project.js';

export type BuildResult = {
  androidApk?: string;
  iosIpa?: string;
};

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
  /** Explicit app directory (--cwd). Omit to discover an Expo/RN app in this workspace. */
  appDir?: string;
  platform?: 'android' | 'ios' | 'all';
}): BuildResult {
  const project = resolveProject(opts.cwd ?? process.cwd(), { appDir: opts.appDir });
  const cwd = project.appDir;
  const platform = opts.platform ?? 'android';
  const out: BuildResult = {};
  process.stdout.write(`App → ${cwd}\n`);
  process.stdout.write(`Package manager → ${project.packageManager}\n`);

  if (platform === 'android' || platform === 'all') {
    const androidDir = join(cwd, 'android');
    if (!existsSync(androidDir) && project.hasExpo) {
      process.stdout.write('No android/ folder — running expo prebuild…\n');
      runExpo(project, ['prebuild', '--platform', 'android', '--no-install']);
    }
    if (!existsSync(androidDir)) {
      throw new Error(
        `No android/ project in ${cwd}. Expo apps need a successful prebuild, ` +
          'or add a native android/ folder.',
      );
    }

    const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
    process.stdout.write('Building Android release APK…\n');
    runCommand(
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
    rememberAndroidArtifact(project, out.androidApk);
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
