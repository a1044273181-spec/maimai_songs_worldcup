import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mai:CUP｜舞萌 DX 中国版年度本命曲决战",
  description:
    "按舞萌中国版年度曲库分组，从舞萌 DX 到舞萌 DX 2026，试听 30 秒后逐轮选出最喜欢的一首。",
  openGraph: {
    title: "mai:CUP｜每个中国版年度，只有一首能登顶",
    description:
      "从经典旧框到舞萌 DX 2026，试听并选出你的版本本命曲。",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "mai:CUP 舞萌 DX 中国版年度本命曲决战",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "mai:CUP｜舞萌 DX 中国版年度本命曲决战",
    description:
      "从经典旧框到舞萌 DX 2026，试听并选出你的版本本命曲。",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
