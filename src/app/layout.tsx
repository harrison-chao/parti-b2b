import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Parti B2B ERP",
  description: "Parti 经销商管理系统",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
