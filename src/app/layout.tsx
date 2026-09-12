/* ═══════════════════════════════════════════════════════════════════════════
   Root Layout — Inter font, SEO meta, suppressHydrationWarning for themes
   ═══════════════════════════════════════════════════════════════════════════ */

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LMCC — Legal Metrology Compliance Checker',
  description:
    'AI-powered compliance checking tool for packaged commodity labels under the Legal Metrology (Packaged Commodities) Rules, 2011 (India). Works completely offline.',
  keywords: [
    'legal metrology', 'compliance', 'India', 'packaged commodities',
    'MRP', 'SIH26034', 'label verification', 'consumer protection',
  ],
  authors: [{ name: 'SIH26034 Team' }],
  openGraph: {
    title: 'LMCC — Legal Metrology Compliance Checker',
    description: 'Verify packaged commodity labels against Indian Legal Metrology Rules, 2011. Offline-first, AI-powered.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} antialiased`}>
        <ThemeProvider attribute='class' defaultTheme='light' enableSystem={false}>
          {children}
          <Toaster richColors position='top-right' />
        </ThemeProvider>
      </body>
    </html>
  );
}
