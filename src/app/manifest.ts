import type { MetadataRoute } from 'next';

// Lets roommates add the app to their home screen. iPhones only allow web push for home-screen apps.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GrocerySplit',
    short_name: 'GrocerySplit',
    description: 'Split grocery receipts with your household, down to each item and its tax.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f3f5f7',
    theme_color: '#f3f5f7',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
