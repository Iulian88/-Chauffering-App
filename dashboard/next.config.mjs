/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy API calls to the backend during development to avoid CORS issues
  async rewrites() {
    return [
      {
        source: '/api/backend/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1'}/:path*`,
      },
    ]
  },
}

export default nextConfig
