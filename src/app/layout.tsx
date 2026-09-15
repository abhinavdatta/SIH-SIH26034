/* ═══════════════════════════════════════════════════════════════════════════
   Root Layout — Inter font, SEO meta, suppressHydrationWarning for themes
   ═══════════════════════════════════════════════════════════════════════════ */

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { AuthProvider } from '@/lib/auth';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'LMCC — Legal Metrology Compliance Checker',
  description:
    'AI-powered compliance checking tool for packaged commodity labels under the Legal Metrology (Packaged Commodities) Rules, 2011 (India). Runs in your browser — your data stays on your device.',
  keywords: [
    'legal metrology', 'compliance', 'India', 'packaged commodities',
    'MRP', 'SIH26034', 'label verification', 'consumer protection',
  ],
  authors: [{ name: 'SIH26034 Team' }],
  openGraph: {
    title: 'LMCC — Legal Metrology Compliance Checker',
    description: 'Verify packaged commodity labels against Indian Legal Metrology Rules, 2011. Private by design, AI-powered.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
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
          <AuthProvider>
            {children}
            <Toaster richColors position='top-right' />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
