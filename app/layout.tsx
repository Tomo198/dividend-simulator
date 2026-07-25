import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "分配金・配当シミュレーター",
  description:
    "ETF・高配当株の手取り配当、資産の推移、目標に必要な投資額を試算します。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
