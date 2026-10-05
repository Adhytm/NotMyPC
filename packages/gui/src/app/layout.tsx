import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '校园网监控 - Campus Network Monitor',
  description: '实时监控校园网质量:Ping/HTTP/DNS/Wi-Fi',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
