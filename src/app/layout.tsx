import type { Metadata } from "next";

import { Sidebar } from "@/components/layout/sidebar";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "이사회 실적관리 시스템",
  description: "이사회 사무국 내부용 실적관리",
};

// 모든 화면은 요청 시점의 DB 데이터로 그린다
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
