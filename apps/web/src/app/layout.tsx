import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'App Release — react-native-deploy',
  description: 'Self-hosted RN build console',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
