import type { NextConfig } from "next";

// 部署到 Cloudflare Pages：根路径托管，无需 basePath
// 中国大陆访问比 github.io 稳定，且不需要自定义域名和备案
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
