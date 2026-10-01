import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for Azure App Service; Vercel ignores this.
  output: "standalone",
  poweredByHeader: false,
};

export default nextConfig;
