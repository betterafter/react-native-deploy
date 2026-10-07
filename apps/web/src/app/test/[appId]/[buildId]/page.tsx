import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getBuild } from '@/lib/r2';
import { OpenSandbox } from './open-sandbox';

export const dynamic = 'force-dynamic';

function consoleBase(headerList: Headers): string {
  const configured = process.env.APP_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  const proto = headerList.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}

export default async function TestPage({
  params,
}: {
  params: Promise<{ appId: string; buildId: string }>;
}) {
  const { appId, buildId } = await params;
  const build = await getBuild(appId, buildId).catch(() => null);
  if (!build) notFound();

  if (build.platform !== 'sandbox' || !build.exportManifest) {
    return (
      <div className="page">
        <header className="header">
          <div>
            <h1>설치 파일</h1>
            <p>이 빌드는 샌드박스 QR이 아니라 설치 파일입니다.</p>
          </div>
        </header>
        <section className="card">
          <a className="btn btn-primary" href={build.installUrl}>
            설치 링크로 이동
          </a>
        </section>
      </div>
    );
  }

  const headerList = await headers();
  const manifest = `${consoleBase(headerList)}/api/manifest?appId=${encodeURIComponent(appId)}&id=${encodeURIComponent(buildId)}`;
  const title = `${build.appId} ${build.version}`;
  const deepLink = `rnd-sandbox://test?manifest=${encodeURIComponent(manifest)}&title=${encodeURIComponent(title)}`;
  const homeLink = 'rnd-sandbox://home';

  return (
    <div className="page">
      <header className="header">
        <div>
          <h1>샌드박스에서 테스트</h1>
          <p>
            {build.appId} · {build.version}
          </p>
        </div>
      </header>
      <section className="card">
        <ol className="steps">
          <li>샌드박스 앱이 설치되어 있어야 합니다. 콘솔 상단에서 받을 수 있습니다.</li>
          <li>QR을 스캔하면 샌드박스 목록에 저장됩니다. 목록에서 누르면 실행됩니다.</li>
          <li>실행 중 목록으로 돌아가려면 아래 런처 링크를 여세요.</li>
        </ol>
        <OpenSandbox deepLink={deepLink} />
        <p style={{ marginTop: 16 }}>
          <a className="btn btn-ghost" href={homeLink}>
            샌드박스 런처로 돌아가기
          </a>
        </p>
        <p className="note">
          목록에 안 보이면 런처로 돌아간 뒤 QR을 다시 스캔하세요. 화면이 켜지자마자 종료되면
          샌드박스를 다시 설치해야 합니다.
        </p>
      </section>
    </div>
  );
}
