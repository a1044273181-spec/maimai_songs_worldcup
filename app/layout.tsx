import type { Metadata } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://mai-cup-cn-2026.xzso3.chatgpt.site";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const socialImageUrl = `${siteUrl}${basePath}/og.png`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "mai:CUP｜舞萌中国版歌曲淘汰赛",
  description:
    "按舞萌中国版曲库展开小组赛、淘汰复活与一对一淘汰赛，试听30秒后选出每个版本的唯一冠军。",
  openGraph: {
    title: "mai:CUP｜从小组赛一路战到总决赛",
    description:
      "从经典旧框到舞萌DX 2026，经历小组赛、复活赛与淘汰赛，选出你的版本本命曲。",
    type: "website",
    images: [
      {
        url: socialImageUrl,
        width: 1731,
        height: 909,
        alt: "mai:CUP 舞萌中国版歌曲淘汰赛",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "mai:CUP｜舞萌中国版歌曲淘汰赛",
    description:
      "小组赛双选、淘汰复活、一对一淘汰，决出你的舞萌版本本命曲。",
    images: [socialImageUrl],
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
