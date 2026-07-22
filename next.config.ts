import type { NextConfig } from "next";

// 应用主体使用静态导出，并由 Capacitor 把 out/ 完整打进离线 APK。
// 对外下载页位于 download-site/，不再把应用主体作为远程启动页。
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
