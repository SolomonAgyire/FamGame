import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WordIn — Bible Word Game',
  description: 'A warm Bible word-unscramble game for solo players, families, and teams.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en">
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap"
      />
    </head>
    <body>{children}</body>
  </html>;
}
