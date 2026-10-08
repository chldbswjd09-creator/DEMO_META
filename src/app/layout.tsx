import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "광고 성과 분석 — 포트폴리오 데모",
  description: "Meta 광고 CSV 분석 대시보드 데모 (샘플 데이터·브라우저 로컬 저장, 실제 데이터 아님)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
