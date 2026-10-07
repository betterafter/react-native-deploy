export type Platform = 'ios' | 'android' | 'sandbox';

/** One file inside an Expo Updates manifest. */
export interface UpdateAsset {
  hash: string;
  key: string;
  contentType: string;
  fileExtension?: string;
  url: string;
}

export interface UpdatePlatformBundle {
  launchAsset: UpdateAsset;
  assets: UpdateAsset[];
}

/** Expo export uploaded for QR testing inside the sandbox app. */
export interface ExportManifest {
  id: string;
  createdAt: string;
  platforms: {
    ios?: UpdatePlatformBundle;
    android?: UpdatePlatformBundle;
  };
  expoConfig?: Record<string, unknown> | null;
}

/** Console statuses — analogous to a release board (ready → test → store → released). */
export type BuildStatus =
  | 'ready'
  | 'testing'
  | 'store_pending'
  | 'released'
  | 'failed';

export interface BuildRecord {
  id: string;
  appId: string;
  platform: Platform;
  /** Human label, e.g. 20261001-7 */
  version: string;
  sdkVersion?: string;
  status: BuildStatus;
  memo: string;
  createdAt: string;
  releasedAt?: string | null;
  /** Object key in the bucket */
  artifactKey: string;
  /** Public HTTPS URL to IPA/APK */
  artifactUrl: string;
  /** iOS Ad Hoc: public HTTPS URL to manifest.plist */
  manifestUrl?: string | null;
  /** What the Test QR should open (itms-services://… or APK https) */
  installUrl: string;
  fileName: string;
  fileSize?: number;
  /** Present when this build is an Expo export for the sandbox. */
  exportManifest?: ExportManifest | null;
}

export interface AppIndex {
  appId: string;
  updatedAt: string;
  buildIds: string[];
}

export const STATUS_LABEL: Record<BuildStatus, string> = {
  ready: '테스트 가능',
  testing: '테스트 중',
  store_pending: '스토어 대기',
  released: '출시됨',
  failed: '실패',
};
