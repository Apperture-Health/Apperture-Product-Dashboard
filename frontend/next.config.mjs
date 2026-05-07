/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    optimizePackageImports: ["ag-grid-react", "ag-grid-community", "react-plotly.js"]
  },
};

export default nextConfig;
