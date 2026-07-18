import type { NextConfig } from "next";

// 部署到 GitHub Pages：https://shihao29.github.io/daily-coach/
// 仓库名是 daily-coach，所以 basePath 必须是 /daily-coach
const nextConfig: NextConfig = {
  output: "export",
  basePath: "/daily-coach",
  assetPrefix: "/daily-coach/",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
