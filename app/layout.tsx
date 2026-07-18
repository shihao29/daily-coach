import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

// 静态导出模式下不能用 headers()，metadata 用静态值
// GitHub Pages 部署后社交分享图走相对路径，由各平台自行解析
export const metadata: Metadata = {
  title: "朝夕｜你的每日监督教练",
  description: "添加每日小目标、打卡进度并按时提醒。所有数据只保存在你的设备里。",
  openGraph: {
    title: "朝夕｜今天，也照顾好自己。",
    description: "一款克制、温暖的每日监督教练。",
    images: ["og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "朝夕｜你的每日监督教练",
    description: "把想做的事，变成今天能完成的小约定。",
    images: ["og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geist.variable} antialiased`}>{children}</body>
    </html>
  );
}
