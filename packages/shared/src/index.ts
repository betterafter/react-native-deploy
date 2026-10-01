export type Platform = 'ios' | 'android';

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
