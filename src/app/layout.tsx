import type { Metadata } from 'next';
import './globals.css';
import Header from '@/components/Header';
import Footer from '@/components/Footer';

export const metadata: Metadata = {
  title: {
    default: '藍想会メディア | 歯科医療・AI技術の最新情報',
    template: '%s | 藍想会メディア',
  },
  description:
    '歯科医療・AI技術・口腔健康に関する最新情報を専門家の視点でお届けする歯科メディアです。',
  metadataBase: new URL('https://media.aisoukai.jp'),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
