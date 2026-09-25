import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WordIn — Bible Word Game',
  description: 'A warm Bible word-unscramble game for solo players, families, and teams.',
  manifest: '/manifest.webmanifest',
  applicationName: 'WordIn',
  appleWebApp: { capable: true, title: 'WordIn', statusBarStyle: 'default' },
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  themeColor: '#ffbe3d',
  width: 'device-width',
  initialScale: 1,
  // The board is a tap surface -- a double-tap zoom mid-puzzle is an
  // accident, not an intent.
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en">
    <head>
      {/* Next emits the standard `mobile-web-app-capable`; older iOS only
          honours the Apple-prefixed name, and without it the home-screen
          icon opens in a Safari tab instead of as its own app. */}
      <meta name="apple-mobile-web-app-capable" content="yes" />
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
