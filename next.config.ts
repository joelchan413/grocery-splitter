import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  // Loaded from node_modules at runtime instead of bundled; it relies on Node's crypto and https.
  serverExternalPackages: ['web-push'],
  async headers() {
    return [
      {
        // Browsers must always fetch the newest service worker, so notification fixes reach every phone.
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
