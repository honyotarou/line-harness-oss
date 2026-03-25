import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || '.next',
  output: 'export',
  transpilePackages: ['@line-crm/shared'],
}
export default nextConfig
