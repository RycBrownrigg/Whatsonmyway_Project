import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { Providers } from './providers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: "What's On My Way - Admin",
  description: 'Pack authoring and management',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white">
        <Providers>
          <nav className="flex items-center gap-6 border-b bg-zinc-100 px-8 py-4">
            <span className="text-sm font-semibold text-zinc-900">
              What&apos;s On My Way — Admin
            </span>
            <Link href="/packs" className="text-sm text-zinc-600 hover:text-blue-600">
              Packs
            </Link>
          </nav>
          <main className="flex flex-1 flex-col">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
