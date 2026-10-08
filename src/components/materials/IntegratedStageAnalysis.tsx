"use client";

// 단계별 성과 분석 — 퍼널 앞단부터. 값은 stageAnalysis 결과를 그대로 렌더링한다.
import type { Stage } from "@/lib/materials/stageAnalysis";
import { cn } from "@/lib/cn";

const REL_TONE: Record<string, string> = {
  낮음: "bg-rose-50 text-rose-700",
  높음: "bg-rose-50 text-rose-700",
  양호: "bg-emerald-50 text-emerald-700",
  "비교 기준 부족": "bg-slate-100 text-slate-500",
};

export function IntegratedStageAnalysis({ stages }: { stages: Stage[] }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-700">단계별 성과 분석</h3>
      <p className="mb-3 mt-0.5 text-[10px] text-slate-400">
        퍼널 앞단(집행량 → 소재 관심 → 랜딩 → 구매 → 수익성) 순서로 확인합니다. 비교는 선택 소재들의 중앙값 기준입니다.
      </p>
      <div className="space-y-3">
        {stages.map((st) => (
          <div key={st.key} className="rounded-lg border border-slate-200 p-3">
            <p className="mb-1.5 text-xs font-bold text-slate-700">{st.title}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[380px] text-xs">
                <tbody>
                  {st.rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="py-1 pr-2 text-slate-500">{r.label}</td>
                      <td className="whitespace-nowrap py-1 pr-2 text-right font-semibold text-slate-800">{r.display}</td>
                      <td className="whitespace-nowrap py-1 pr-2 text-right text-[11px] text-slate-400">{r.median != null ? `중앙값 ${r.median}` : ""}</td>
                      <td className="py-1 text-right">
                        {r.rel ? <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", REL_TONE[r.rel] ?? "bg-slate-100 text-slate-500")}>{r.rel}</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
