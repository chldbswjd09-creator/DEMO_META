import type { Config } from "tailwindcss";

// 디자인 토큰 — 밝은 프리미엄 · 소프트 민트/아이스톤 · 실버 포인트 (가독성 우선).
// 기존 컴포넌트가 이미 쓰는 색 이름(brand / slate-50·100 / blue-700)만 재정의해
// 로직 변경 없이 전체 톤을 한 번에 통일한다.
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // 포인트: 민트/아쿠아 (버튼·선택·링크). 흰 배경 위 텍스트 대비 확보(가독성 우선).
        brand: {
          DEFAULT: "#0c8074",
          dark: "#0a6a60",
          soft: "#e6f5f2",
          fg: "#ffffff",
        },
        // 기존 버튼 hover(bg-blue-700)를 브랜드 다크로 치환 — 클래스 유지, 톤만 통일.
        blue: { 700: "#0a6a60" },
        // 베이스: 아이보리/아이스 민트 (페이지 배경으로 쓰이는 slate-50/100만 조정, 나머지 slate는 유지해 대비 보존).
        slate: { 50: "#f2f7f6", 100: "#e8efee" },
      },
      boxShadow: {
        // 카드: 얇은 테두리 + 은은한 depth
        card: "0 1px 2px 0 rgb(15 42 52 / 0.04), 0 10px 26px -14px rgb(15 42 52 / 0.13)",
        soft: "0 1px 3px 0 rgb(15 42 52 / 0.08)",
        pop: "0 14px 34px -14px rgb(12 128 116 / 0.30)",
      },
      fontFamily: {
        sans: [
          "var(--font-sans)",
          "Pretendard",
          "-apple-system",
          "Segoe UI",
          "Malgun Gothic",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
