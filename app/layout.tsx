import type { Metadata } from "next";
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
  title: "平衡轮自评",
  description: "花 3 - 5 分钟给 8 个生活维度打分，看看你的车轮跑起来什么样。",
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
