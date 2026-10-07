'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BuildRecord, BuildStatus } from '@rnd/shared';
import { STATUS_LABEL } from '@rnd/shared';

type AppSummary = {
  appId: string;
  updatedAt: string;
  buildCount: number;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${y}. ${m}. ${day} ${hh}:${mm}`;
}

function platformLabel(platform: string) {
  if (platform === 'ios') return 'iOS';
  if (platform === 'android') return 'Android';
  if (platform === 'sandbox') return 'QR 테스트';
  return platform;
}

type TestTab = 'install' | 'sandbox';

function buildsForVersion(all: BuildRecord[], target: BuildRecord) {
  const sameVersion = all.filter((b) => b.version === target.version);
  const pool = sameVersion.length > 0 ? sameVersion : [target];
  const install = pool.filter((b) => b.platform === 'ios' || b.platform === 'android');
  const sandboxBuild = pool.find((b) => b.platform === 'sandbox') ?? null;
  return { install, sandboxBuild };
}

export default function HomePage() {
  const [apps, setApps] = useState<AppSummary[]>([]);
  const [appId, setAppId] = useState('');
  const [booted, setBooted] = useState(false);
  const [builds, setBuilds] = useState<BuildRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testTarget, setTestTarget] = useState<BuildRecord | null>(null);
  const [testTab, setTestTab] = useState<TestTab>('install');
  const [installPlatform, setInstallPlatform] = useState<'ios' | 'android'>('android');
  const [token, setToken] = useState('');
  const [sandbox, setSandbox] = useState<{
    name: string;
    android: { url: string } | null;
    ios: { url: string } | null;
  } | null>(null);

  useEffect(() => {
    void fetch('/api/sandbox')
      .then((res) => res.json())
      .then(
        (data: {
          sandbox?: {
            name: string;
            android: { url: string } | null;
            ios: { url: string } | null;
          } | null;
        }) => {
          setSandbox(data.sandbox ?? null);
        },
      )
      .catch(() => setSandbox(null));
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem('rnd_deploy_token');
    if (saved) setToken(saved);

    const fromQuery = new URLSearchParams(window.location.search).get('appId');
    void (async () => {
      try {
        const res = await fetch('/api/apps');
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '앱 목록을 불러오지 못했습니다');
        const list = (data.apps ?? []) as AppSummary[];
        setApps(list);
        const next = fromQuery || list[0]?.appId || '';
        setAppId(next);
        if (next && next !== fromQuery) {
          const url = new URL(window.location.href);
          url.searchParams.set('appId', next);
          window.history.replaceState(null, '', `${url.pathname}${url.search}`);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : '앱 목록을 불러오지 못했습니다');
        if (fromQuery) setAppId(fromQuery);
      } finally {
        setBooted(true);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!appId) {
      setBuilds([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/builds?appId=${encodeURIComponent(appId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '빌드를 불러오지 못했습니다');
      setBuilds(data.builds ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '빌드를 불러오지 못했습니다');
      setBuilds([]);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    if (!booted) return;
    void load();
  }, [booted, load]);

  function selectApp(next: string) {
    setAppId(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set('appId', next);
    else url.searchParams.delete('appId');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }

  function ensureToken(): string | null {
    const existing = token || window.localStorage.getItem('rnd_deploy_token') || '';
    if (existing) {
      if (existing !== token) setToken(existing);
      return existing;
    }
    const entered = window.prompt('메모를 바꾸려면 배포 토큰을 입력하세요.');
    if (!entered?.trim()) return null;
    const value = entered.trim();
    window.localStorage.setItem('rnd_deploy_token', value);
    setToken(value);
    return value;
  }

  async function patchBuild(id: string, patch: Partial<BuildRecord>) {
    const auth = ensureToken();
    if (!auth) return;
    const res = await fetch(`/api/builds/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ appId, ...patch }),
    });
    if (!res.ok) {
      alert(await res.text());
      return;
    }
    await load();
  }

  const filtered = useMemo(() => {
    return builds.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (q.trim()) {
        const hay = `${b.version} ${b.memo} ${b.platform}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [builds, statusFilter, q]);

  const appOptions = useMemo(() => {
    if (!appId || apps.some((app) => app.appId === appId)) return apps;
    return [{ appId, updatedAt: '', buildCount: 0 }, ...apps];
  }, [apps, appId]);

  const filtering = statusFilter !== 'all' || q.trim().length > 0;

  const testPair = useMemo(() => {
    if (!testTarget) return null;
    return buildsForVersion(builds, testTarget);
  }, [builds, testTarget]);

  const activeInstall = useMemo(() => {
    if (!testPair) return null;
    return (
      testPair.install.find((b) => b.platform === installPlatform) ??
      testPair.install[0] ??
      null
    );
  }, [testPair, installPlatform]);

  function openTest(b: BuildRecord) {
    const pair = buildsForVersion(builds, b);
    const initialTab: TestTab =
      b.platform === 'sandbox'
        ? 'sandbox'
        : pair.install.length > 0
          ? 'install'
          : pair.sandboxBuild
            ? 'sandbox'
            : 'install';
    setTestTab(initialTab);
    if (b.platform === 'ios' || b.platform === 'android') {
      setInstallPlatform(b.platform);
    } else if (pair.install[0]?.platform === 'ios' || pair.install[0]?.platform === 'android') {
      setInstallPlatform(pair.install[0].platform);
    }
    setTestTarget(b);
  }

  return (
    <>
    {sandbox ? (
      <div className="sandbox-banner">
        <div className="sandbox-banner-row">
          <p>{sandbox.name}을 설치해서 간편하게 테스트해보세요!</p>
          {sandbox.android ? (
            <a className="btn btn-primary" href={sandbox.android.url}>
              Android 다운로드
            </a>
          ) : null}
          {sandbox.ios ? (
            <a className="btn btn-primary" href={sandbox.ios.url}>
              iOS 다운로드
            </a>
          ) : null}
        </div>
        <p className="sandbox-banner-guide">
          샌드박스가 설치되어 있으면 그 안에서 테스트합니다. 없으면 아래 각 빌드의
          테스트로 설치 파일을 받아 확인합니다. iOS 샌드박스를 만들어 올리려면 Apple
          Developer 계정이 필요합니다. 계정이 없으면 Android 샌드박스를 쓰거나, 각
          빌드를 직접 설치해 테스트합니다.
        </p>
      </div>
    ) : null}
    <div className="page">
      <header className="header">
        <div>
          <h1>{appId || '빌드'}</h1>
          <p>설치 파일은 QR로 설치하고, Expo export는 샌드박스 QR로 엽니다.</p>
        </div>
        {appOptions.length > 1 ? (
          <label className="app-switch">
            앱
            <select
              value={appId}
              onChange={(e) => selectApp(e.target.value)}
              aria-label="앱"
            >
              {appOptions.map((app) => (
                <option key={app.appId} value={app.appId}>
                  {app.appId}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </header>

      <section className="card">
        <div className="toolbar">
          <h2>올린 빌드</h2>
          <div className="toolbar-right">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="상태"
            >
              <option value="all">전체</option>
              {(Object.keys(STATUS_LABEL) as BuildStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <input
              type="search"
              placeholder="버전, 메모 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="검색"
            />
            <button type="button" className="btn btn-ghost" onClick={() => void load()}>
              새로고침
            </button>
          </div>
        </div>

        {loading ? (
          <div className="empty">불러오는 중…</div>
        ) : error ? (
          <div className="empty">{error}</div>
        ) : !appId || (filtered.length === 0 && !filtering) ? (
          <div className="empty">
            {appId ? `${appId}에는 아직 빌드가 없습니다.` : '아직 올린 빌드가 없습니다.'}
            <div className="code" style={{ marginTop: 12, textAlign: 'left' }}>
              {`npx rnd deploy -m "메모"\n# Expo 앱이면 설치 파일 + 샌드박스 QR을 같이 올립니다`}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">조건에 맞는 빌드가 없습니다.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>올린 시각</th>
                <th>버전</th>
                <th>플랫폼</th>
                <th>상태</th>
                <th>메모</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id}>
                  <td>{formatDate(b.createdAt)}</td>
                  <td>
                    <span className="version-link">{b.version}</span>
                  </td>
                  <td>{platformLabel(b.platform)}</td>
                  <td>
                    <span className="status">
                      <span className={`dot ${b.status}`} />
                      {STATUS_LABEL[b.status]}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ padding: '4px 8px' }}
                      title="메모 수정"
                      onClick={() => {
                        const next = window.prompt('메모', b.memo ?? '');
                        if (next == null) return;
                        void patchBuild(b.id, { memo: next });
                      }}
                    >
                      <span className="memo">{b.memo || '—'}</span>
                    </button>
                  </td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => openTest(b)}
                      >
                        테스트
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {testTarget && testPair && (
        <div className="modal-backdrop" onClick={() => setTestTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>테스트</h3>
            <p style={{ marginBottom: 12 }}>
              {testTarget.version}
              {testTarget.memo ? ` · ${testTarget.memo}` : ''}
            </p>

            <div className="modal-tabs" role="tablist" aria-label="테스트 종류">
              <button
                type="button"
                role="tab"
                className="modal-tab"
                aria-selected={testTab === 'install'}
                disabled={testPair.install.length === 0}
                onClick={() => setTestTab('install')}
              >
                설치용
              </button>
              <button
                type="button"
                role="tab"
                className="modal-tab"
                aria-selected={testTab === 'sandbox'}
                disabled={!testPair.sandboxBuild}
                onClick={() => setTestTab('sandbox')}
              >
                QR 테스트
              </button>
            </div>

            {testTab === 'install' ? (
              testPair.install.length === 0 ? (
                <div className="modal-empty">
                  같은 버전의 설치 파일이 없습니다.
                  <br />
                  `rnd deploy`로 IPA/APK를 같이 올려 주세요.
                </div>
              ) : (
                <>
                  <p>
                    휴대폰으로 QR을 스캔하면 이 빌드를 설치합니다.
                  </p>
                  {testPair.install.length > 1 ? (
                    <div className="platform-tabs" role="tablist" aria-label="설치 플랫폼">
                      {testPair.install.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          role="tab"
                          className="platform-tab"
                          aria-selected={activeInstall?.id === b.id}
                          onClick={() => {
                            if (b.platform === 'ios' || b.platform === 'android') {
                              setInstallPlatform(b.platform);
                            }
                          }}
                        >
                          {platformLabel(b.platform)}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {activeInstall ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/qr?appId=${encodeURIComponent(activeInstall.appId)}&id=${encodeURIComponent(activeInstall.id)}`}
                        alt="설치 QR"
                      />
                      <p style={{ marginTop: 0 }}>{activeInstall.installUrl}</p>
                    </>
                  ) : null}
                </>
              )
            ) : testPair.sandboxBuild ? (
              <>
                <p>
                  QR을 스캔하면 샌드박스 앱이 이 화면을 저장합니다. 앱을 완전히 종료한 뒤
                  다시 열면 로드됩니다.
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/qr?appId=${encodeURIComponent(testPair.sandboxBuild.appId)}&id=${encodeURIComponent(testPair.sandboxBuild.id)}`}
                  alt="샌드박스 QR"
                />
                <p style={{ marginTop: 0 }}>{testPair.sandboxBuild.installUrl}</p>
              </>
            ) : (
              <div className="modal-empty">
                같은 버전의 샌드박스 export가 없습니다.
                <br />
                Expo 앱에서 `rnd deploy`를 다시 실행해 주세요.
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => setTestTarget(null)}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
