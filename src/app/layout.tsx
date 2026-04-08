import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ManifestIQ Deal Engine',
  description: 'Liquidation deal scoring and tracking',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-surface-0 text-zinc-200 antialiased">{children}</body>
    </html>
  );
}
