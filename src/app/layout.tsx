import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'LeadFlow - AI-Powered Lead Intelligence',
  description: 'AI-powered lead intelligence and hyper-personalized outreach platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-surface-950 text-surface-100 min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
