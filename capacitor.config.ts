import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // 离线版使用新的应用身份，可与旧版并存完成首次数据迁移。
  // 后续版本必须保持这个 appId 不变，否则 Android 会把它当成新应用。
  appId: "com.shihao29.zhaoxi",
  appName: "朝夕·离线",
  // Next.js 静态导出的完整页面直接打进 APK，不再加载远程网址。
  webDir: "out",
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_daily_coach",
      iconColor: "#A8754F",
    },
  },
};

export default config;
