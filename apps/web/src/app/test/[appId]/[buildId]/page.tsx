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
  const deepLink = `rnd-sandbox://test?manifest=${encodeURIComponent(manifest)}`;

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
          <li>샌드박스 앱이 이 빌드를 저장합니다.</li>
          <li>앱을 완전히 종료합니다. 홈으로 내리는 것만으로는 부족합니다.</li>
          <li>샌드박스를 다시 열면 이 화면이 로드됩니다.</li>
        </ol>
        <OpenSandbox deepLink={deepLink} />
        <p className="note">
          다른 빌드로 바뀌지 않으면 샌드박스 앱의 저장공간을 지운 뒤 이 QR을 다시 스캔하세요.
          화면이 켜지자마자 종료되면 샌드박스를 다시 설치해야 합니다.
        </p>
      </section>
    </div>
  );
}
