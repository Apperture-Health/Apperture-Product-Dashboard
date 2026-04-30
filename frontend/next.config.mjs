/** @type {import('next').NextConfig} */
const BACKEND = process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

const nextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: ["ag-grid-react", "ag-grid-community", "react-plotly.js"]
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND}/api/:path*` },
      { source: "/auth/:path*", destination: `${BACKEND}/auth/:path*` },
    ];
  },
};

export default nextConfig;
