import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GatherWord — Bible Word Game',
  description: 'A warm Bible word-unscramble game for solo players, families, and teams.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
