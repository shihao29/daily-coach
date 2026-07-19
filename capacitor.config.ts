import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dailycoach.app",
  appName: "朝夕",
  webDir: "capacitor-web",
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_daily_coach",
      iconColor: "#A8754F",
    },
  },
};

export default config;
