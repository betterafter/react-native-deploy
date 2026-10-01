'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BuildRecord, BuildStatus } from '@rnd/shared';
import { STATUS_LABEL } from '@rnd/shared';

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

export default function HomePage() {
  const [appId, setAppId] = useState('my-app');
  const [builds, setBuilds] = useState<BuildRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [testTarget, setTestTarget] = useState<BuildRecord | null>(null);
  const [token, setToken] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromQuery = params.get('appId');
    if (fromQuery) setAppId(fromQuery);
    const saved = window.localStorage.getItem('rnd_deploy_token');
    if (saved) setToken(saved);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/builds?appId=${encodeURIComponent(appId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'failed to load');
      setBuilds(data.builds ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'load failed');
      setBuilds([]);
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    return builds.filter((b) => {
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;
      if (q.trim()) {
        const hay = `${b.version} ${b.memo} ${b.sdkVersion ?? ''}`.toLowerCase();
        if (!hay.includes(q.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [builds, statusFilter, q]);

  async function patchBuild(id: string, patch: Partial<BuildRecord>) {
    if (!token) {
      alert('메모/상태 변경에는 DEPLOY_API_TOKEN이 필요합니다. 상단에 토큰을 입력하세요.');
      return;
    }
    window.localStorage.setItem('rnd_deploy_token', token);
    const res = await fetch(`/api/builds/${id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
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

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>앱 출시</h1>
          <p>
            셀프호스트 릴리스 콘솔입니다. CLI로 버전을 올리면 목록에 쌓이고, 테스트 QR로
            Ad Hoc / APK 설치를 할 수 있어요.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            alert(
              '버전 등록은 CLI에서 합니다.\n\nrnd upload -f ./app.ipa -a ' +
                appId +
                ' -m "메모"',
            )
          }
        >
          버전 등록
        </button>
      </header>

      <nav className="tabs">
        <span className="tab active">버전</span>
        <span className="tab">설정</span>
      </nav>

      <div className="banner">
        DB 없이 Cloudflare R2에 빌드 메타·바이너리를 저장합니다. 스토어 제출(Play /
        App Store Connect) 자동화는 다음 단계에서 붙일 수 있어요.
      </div>

      <section className="card">
        <div className="toolbar">
          <h2>버전 내역</h2>
          <div className="toolbar-right">
            <input
              type="text"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="appId"
              style={{ width: 120 }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="상태"
            >
              <option value="all">상태</option>
              {(Object.keys(STATUS_LABEL) as BuildStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
            <input
              type="search"
              placeholder="버전 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button type="button" className="btn btn-ghost" onClick={() => void load()}>
              새로고침
            </button>
          </div>
        </div>

        <div className="toolbar" style={{ marginTop: -4 }}>
          <input
            type="password"
            placeholder="DEPLOY_API_TOKEN (메모/상태 변경용)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
        </div>

        {loading ? (
          <div className="empty">불러오는 중…</div>
        ) : error ? (
          <div className="empty">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            아직 버전이 없어요.
            <div className="code" style={{ marginTop: 12, textAlign: 'left' }}>
              {`export RND_API_URL=http://localhost:3000
export RND_API_TOKEN=…
rnd upload -f ./app.ipa -a ${appId} -m "first build"`}
            </div>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>생성일시</th>
                <th>번들 버전</th>
                <th>플랫폼</th>
                <th>SDK</th>
                <th>상태</th>
                <th>메모</th>
                <th>출시일시</th>
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
                  <td>{b.platform}</td>
                  <td>{b.sdkVersion || '-'}</td>
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
                  <td>{b.releasedAt ? formatDate(b.releasedAt) : ''}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setTestTarget(b)}
                      >
                        테스트
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        disabled={b.status === 'released'}
                        onClick={() => {
                          void patchBuild(b.id, {
                            status: 'store_pending',
                          });
                          alert(
                            '스토어 배포 연동은 다음 단계입니다. 상태는 “스토어 대기”로 표시만 바꿉니다.',
                          );
                        }}
                      >
                        출시 요청
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {testTarget && (
        <div className="modal-backdrop" onClick={() => setTestTarget(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>테스트 설치</h3>
            <p>
              {testTarget.version} · {testTarget.platform}
              <br />
              {testTarget.installUrl}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/qr?appId=${encodeURIComponent(testTarget.appId)}&id=${encodeURIComponent(testTarget.id)}`}
              alt="install QR"
            />
            <p style={{ marginTop: 0 }}>
              iOS는 Ad Hoc 등록 기기에서 `itms-services` QR을 스캔하세요. Android는 APK
              URL입니다.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => {
                void patchBuild(testTarget.id, { status: 'testing' });
                setTestTarget(null);
              }}
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
