/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@shared'],
  // Se ejecuta como servidor Next.js (Docker/PM2), NO como export estático:
  // necesitamos rutas dinámicas y el proxy /api/upload-firmware.
  images: { unoptimized: true },
};

module.exports = nextConfig;
