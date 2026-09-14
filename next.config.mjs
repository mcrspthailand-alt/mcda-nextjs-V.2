/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: '/mcda-logo.png',
        destination: '/mcda-logo.svg',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
