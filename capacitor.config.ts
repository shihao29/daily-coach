import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.dailycoach.app",
  appName: "朝夕",
  webDir: "capacitor-web",
  server: {
    url: "https://daily-coach-ptvi2ebd.edgeone.cool",
    cleartext: false,
  },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_daily_coach",
      iconColor: "#A8754F",
    },
  },
};

export default config;
