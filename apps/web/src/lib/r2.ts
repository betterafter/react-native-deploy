import { PutObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { AppIndex, BuildRecord } from '@rnd/shared';

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

export function getR2() {
  const accountId = required('R2_ACCOUNT_ID');
  return {
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: required('R2_ACCESS_KEY_ID'),
        secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
      },
    }),
    bucket: required('R2_BUCKET'),
    publicBase: required('R2_PUBLIC_BASE_URL').replace(/\/$/, ''),
  };
}

export function publicUrl(key: string): string {
  const { publicBase } = getR2();
  return `${publicBase}/${key}`;
}

export function buildObjectKey(appId: string, buildId: string, fileName: string) {
  return `apps/${appId}/builds/${buildId}/${fileName}`;
}

export function metaKey(appId: string, buildId: string) {
  return `apps/${appId}/builds/${buildId}/meta.json`;
}

export function indexKey(appId: string) {
  return `apps/${appId}/index.json`;
}

async function readJson<T>(key: string): Promise<T | null> {
  const { client, bucket } = getR2();
  try {
    const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const text = await out.Body?.transformToString();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeJson(key: string, data: unknown) {
  const { client, bucket } = getR2();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: JSON.stringify(data, null, 2),
      ContentType: 'application/json',
    }),
  );
}

export async function putText(key: string, body: string, contentType: string) {
  const { client, bucket } = getR2();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function createPresignedUpload(key: string, contentType: string) {
  const { client, bucket } = getR2();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client, command, { expiresIn: 60 * 15 });
}

export async function getIndex(appId: string): Promise<AppIndex> {
  return (
    (await readJson<AppIndex>(indexKey(appId))) ?? {
      appId,
      updatedAt: new Date().toISOString(),
      buildIds: [],
    }
  );
}

export async function saveBuild(build: BuildRecord) {
  await writeJson(metaKey(build.appId, build.id), build);
  const index = await getIndex(build.appId);
  if (!index.buildIds.includes(build.id)) {
    index.buildIds = [build.id, ...index.buildIds];
  }
  index.updatedAt = new Date().toISOString();
  await writeJson(indexKey(build.appId), index);
}

export async function listBuilds(appId: string): Promise<BuildRecord[]> {
  const index = await getIndex(appId);
  const builds: BuildRecord[] = [];
  for (const id of index.buildIds) {
    const b = await readJson<BuildRecord>(metaKey(appId, id));
    if (b) builds.push(b);
  }
  return builds;
}

export async function getBuild(appId: string, id: string) {
  return readJson<BuildRecord>(metaKey(appId, id));
}

export async function updateBuild(
  appId: string,
  id: string,
  patch: Partial<Pick<BuildRecord, 'memo' | 'status' | 'releasedAt'>>,
) {
  const current = await getBuild(appId, id);
  if (!current) return null;
  const next = { ...current, ...patch };
  await writeJson(metaKey(appId, id), next);
  return next;
}

export function assertDeployToken(authHeader: string | null) {
  const expected = required('DEPLOY_API_TOKEN');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (token !== expected) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }
}
