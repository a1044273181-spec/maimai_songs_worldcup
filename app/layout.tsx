import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "mai:CUP｜舞萌版本本命曲决战",
  description:
    "以舞萌国服曲库为准，在每个 maimai 版本中逐轮选出你最喜欢的一首。",
  openGraph: {
    title: "mai:CUP｜每个版本，只有一首能登顶",
    description: "从初代到舞萌DX 2026，选出你的版本本命曲。",
    type: "website",
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "mai:CUP 舞萌国服版本本命曲决战",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "mai:CUP｜舞萌版本本命曲决战",
    description: "从初代到舞萌DX 2026，选出你的版本本命曲。",
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
