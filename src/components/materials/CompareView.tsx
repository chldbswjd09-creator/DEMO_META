"use client";

import { useMemo } from "react";
import { useMaterials } from "@/components/providers/MaterialsProvider";
import { buildMaterialAnalysis, compareMaterials } from "@/lib/materials/compute";
import { formatByUnit, formatKRW, formatNumber } from "@/lib/metrics/format";
import { EmptyState } from "@/components/ui/common";
import { AnalysisNav } from "@/components/materials/AnalysisNav";
import { cn } from "@/lib/cn";

export function CompareView() {
  const { materials, selected, settings, backToLibrary } = useMaterials();
  const analyses = useMemo(
    () => selected.map((id) => materials.find((m) => m.id === id)).filter(Boolean).map((m) => buildMaterialAnalysis(m!, settings)),
    [selected, materials, settings],
  );
  const cmp = useMemo(() => compareMaterials(analyses), [analyses]);

  if (analyses.length < 2) {
    return (<div className="min-h-screen bg-slate-50 p-6"><EmptyState title="비교하려면 2개 이상 선택하세요" /><button onClick={backToLibrary} className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">목록으로</button></div>);
  }

  const rawFmt = (key: string, v: number) =>
    key === "spend" || key === "purchaseValue" ? formatKRW(v) : formatNumber(v);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-5 py-2.5">
        <div className="mx-auto flex max-w-6xl items-center gap-2">
          <AnalysisNav onHome={backToLibrary} onBack={backToLibrary} />
          <h1 className="text-base font-bold text-slate-800">선택 자료 비교 ({analyses.length}개)</h1>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-4">
        <p className="mb-2 text-[11px] text-slate-400">유리한 값을 강조합니다. ROAS·CTR·구매 전환율 등은 높을수록, CPM·CPC·CPA 등은 낮을수록 유리합니다. 광고비 등 볼륨 지표와 데이터 없는 항목은 강조하지 않습니다.</p>
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left">
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 font-medium text-slate-500">지표</th>
                {cmp.materials.map((m) => (
                  <th key={m.id} className="px-3 py-2 text-right font-semibold text-slate-700">
                    <div className="clamp-1 max-w-[160px]" title={m.name}>{m.name}</div>
                    <div className="text-[10px] font-normal text-slate-400">{m.periodStart || "?"}~{m.periodEnd || "?"}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-100 bg-white">
                <td className="sticky left-0 bg-white px-3 py-1.5 font-medium text-slate-500">광고 수</td>
                {cmp.materials.map((m) => <td key={m.id} className="px-3 py-1.5 text-right">{m.adCount}</td>)}
              </tr>
              {cmp.rawRows.filter((r) => r.key !== "adCount").map((r) => (
                <tr key={r.key} className="border-b border-slate-100">
                  <td className="sticky left-0 bg-white px-3 py-1.5 font-medium text-slate-500">{r.label}</td>
                  {r.values.map((v, i) => <td key={i} className="px-3 py-1.5 text-right text-slate-700">{rawFmt(r.key, v)}</td>)}
                </tr>
              ))}
              <tr className="border-b border-slate-200 bg-slate-50"><td className="px-3 py-1 text-[10px] font-semibold text-slate-400" colSpan={cmp.materials.length + 1}>계산 지표 (유리한 값 강조)</td></tr>
              {cmp.metricRows.map((r) => (
                <tr key={r.key} className="border-b border-slate-100">
                  <td className="sticky left-0 bg-white px-3 py-1.5 font-medium text-slate-500">{r.label}</td>
                  {r.values.map((v, i) => (
                    <td key={i} className={cn("px-3 py-1.5 text-right", r.bestIndex === i ? "bg-emerald-50 font-bold text-emerald-700" : "text-slate-700")}>
                      {v === null ? <span className="text-slate-300">—</span> : formatByUnit(v, r.unit)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-slate-400">기간이 다른 자료도 나란히 비교할 수 있습니다. 값이 없는 지표(원본 열 없음/데이터 없음)는 “—”로 표시하고 강조 대상에서 제외합니다.</p>
      </main>
    </div>
  );
}
