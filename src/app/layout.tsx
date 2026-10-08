import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "광고 성과 분석 (CSV)",
  description: "Meta 광고관리자 CSV를 분석 자료로 저장하고 합산·비교하는 개인용 도구",
};

// MaterialsProvider(데이터 로딩)는 인증된 대시보드(app/page.tsx)에서만 마운트한다.
// → 로그인 화면에서는 /api/materials를 호출하지 않는다.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
