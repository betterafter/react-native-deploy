'use client';

import { useEffect } from 'react';

export function OpenSandbox({ deepLink }: { deepLink: string }) {
  useEffect(() => {
    window.location.href = deepLink;
  }, [deepLink]);

  return (
    <a className="btn btn-primary" href={deepLink}>
      샌드박스 열기
    </a>
  );
}
