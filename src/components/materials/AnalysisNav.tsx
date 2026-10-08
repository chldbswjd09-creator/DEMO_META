"use client";

// 모든 분석 화면 공용 상단 네비게이션 — 로고 + [처음으로] [이전].
// 처음으로: 사이트 최초 메인(라이브러리)로. 이전: 직전 화면으로(각 화면이 onBack으로 주입).
import { LogoMark } from "@/components/ui/Logo";

export function AnalysisNav({ onHome, onBack }: { onHome: () => void; onBack: () => void }) {
  const cls = "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600 shadow-soft hover:border-slate-300 hover:text-slate-800";
  return (
    <div className="flex items-center gap-2">
      <button onClick={onHome} className="shrink-0" aria-label="처음으로"><LogoMark size={30} /></button>
      <button onClick={onHome} className={cls}>처음으로</button>
      <button onClick={onBack} className={cls}>이전</button>
    </div>
  );
}
