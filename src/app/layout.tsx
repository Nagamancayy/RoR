import type { Metadata } from 'next';
import { Shell } from '@/components/shell';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Real or Random Lab', template: '%s · Real or Random Lab' },
  description:
    'A local-first cryptography lab for blind Real-or-Random distinguishing experiments.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
