import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Ma_Shan_Zheng, Caveat } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Ma Shan Zheng covers CJK (Chinese handwriting); Caveat handles Latin in
// the same warm register. Both load via next/font, self-hosted at build.
const maShanZheng = Ma_Shan_Zheng({
  variable: "--font-zh-hand",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const caveat = Caveat({
  variable: "--font-en-hand",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "生命之轮",
  description: "花 3 - 5 分钟给 8 个生活维度打分，看你人生这辆车此刻的形状，颠不颠。",
};

// viewport-fit=cover 让 iOS Safari 暴露 env(safe-area-inset-*) 让 web app 知道
// Dynamic Island / status bar 占用. 没这条 env() 全返 0, safe-area-inset-top 计算
// 失败 (导致 done page card 紧贴 Dynamic Island 视觉过高).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${maShanZheng.variable} ${caveat.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
