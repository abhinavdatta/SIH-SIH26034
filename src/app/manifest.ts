import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LMCC — Legal Metrology Compliance Checker',
    short_name: 'LMCC',
    description:
      'Scan product labels, check Legal Metrology (Packaged Commodities) compliance, and export audit reports.',
    start_url: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#2563eb',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  };
}
