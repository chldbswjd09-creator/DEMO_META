"use client";

import { useMemo, useState } from "react";
import { useMaterials } from "@/components/providers/MaterialsProvider";
import { aggregateMaterials, buildMaterialAnalysis, detectDuplicates, synthAnalysis, type DedupMode } from "@/lib/materials/compute";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { Tooltip } from "@/components/ui/Tooltip";
import { MetricGroups } from "@/components/dashboard/detail/MetricGroups";
import { ShareSummaryCard } from "@/components/dashboard/detail/ShareSummaryCard";
import { VERDICT_META } from "@/lib/verdict/engine";
import { EmptyState } from "@/components/ui/common";
import { AnalysisNav } from "@/components/materials/AnalysisNav";
import { formatKRW, formatNumber } from "@/lib/metrics/format";

function RawTotal({ label, value, note }: { label: React.ReactNode; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-2">
      <p className="text-[10px] text-slate-400">{label}{note && <span className="ml-1 text-amber-500">{note}</span>}</p>
      <p className="text-sm font-bold text-slate-800">{value}</p>
    </div>
  );
}

export function AggregateView() {
  const { materials, selected, settings, backToLibrary } = useMaterials();
  const [decided, setDecided] = useState<DedupMode | null>(null);

  const analyses = useMemo(
    () => selected.map((id) => materials.find((m) => m.id === id)).filter(Boolean).map((m) => buildMaterialAnalysis(m!, settings)),
    [selected, materials, settings],
  );
  const duplicates = useMemo(() => detectDuplicates(analyses), [analyses]);
  const needDecision = duplicates.length > 0 && decided === null;
  const mode: DedupMode = decided ?? "exclude";
  const result = useMemo(() => (needDecision ? null : aggregateMaterials(analyses, mode, settings)), [analyses, mode, settings, needDecision]);

  if (analyses.length === 0) {
    return (<div className="min-h-screen bg-slate-50 p-6"><EmptyState title="선택된 자료가 없습니다" /><button onClick={backToLibrary} className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">목록으로</button></div>);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white px-5 py-2.5">
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <AnalysisNav onHome={backToLibrary} onBack={backToLibrary} />
          <h1 className="text-base font-bold text-slate-800">선택 자료 합산 ({analyses.length}개)</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-3 px-5 py-4">
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
          합산 자료: {analyses.map((a) => a.name).join(" · ")}
        </div>

        {needDecision ? (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <h2 className="text-sm font-bold text-amber-800">중복 합산 경고</h2>
            <p className="mt-1 text-xs text-amber-700">선택한 분석 자료에 동일 광고·동일 기간 데이터가 포함되어 있습니다. 합산 시 광고비, 구매, 매출 등이 중복 계산될 수 있습니다.</p>
            <ul className="mt-2 max-h-32 overflow-y-auto text-[11px] text-amber-700">{duplicates.slice(0, 20).map((d) => <li key={d.key}>· {d.label} ({d.materialIds.length}개 자료)</li>)}</ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setDecided("exclude")} className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">중복 항목 제외 후 합산 (권장)</button>
              <button onClick={() => setDecided("include")} className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">중복 포함하여 합산</button>
              <button onClick={backToLibrary} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white">합산 취소</button>
            </div>
          </section>
        ) : result ? (
          <>
            {duplicates.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                중복 처리: {mode === "exclude" ? "중복 제외 후 합산" : "중복 포함 합산"} · 감지된 중복 {duplicates.length}건
                <button onClick={() => setDecided(mode === "exclude" ? "include" : "exclude")} className="ml-2 underline">{mode === "exclude" ? "중복 포함으로 변경" : "중복 제외로 변경"}</button>
              </div>
            )}

            <section className="rounded-xl border-2 border-slate-200 bg-white p-4">
              <div className="mb-2 flex items-center gap-2"><VerdictBadge code={result.verdict.code} size="md" /><span className="text-[11px] text-slate-500">합산 광고 {result.adCount}개</span></div>
              <p className="text-sm font-semibold text-slate-800">{VERDICT_META[result.verdict.code].label} — {result.verdict.action}</p>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-2 text-sm font-bold text-slate-700">합산 원본값</h3>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <RawTotal label="광고비" value={formatKRW(result.agg.spend)} />
                <RawTotal label="노출" value={formatNumber(result.agg.impressions)} />
                <RawTotal
                  label={<Tooltip content="선택한 자료 간 도달 사용자가 중복될 수 있어, 합산 도달과 빈도는 참고용 추정값입니다."><span className="cursor-help border-b border-dotted border-slate-400">도달</span></Tooltip>}
                  value={formatNumber(result.agg.reach)}
                  note={result.reachEstimated ? "· 추정 합계" : undefined}
                />
                <RawTotal label="링크 클릭" value={result.present.includes("linkClicks") ? formatNumber(result.agg.linkClicks) : "원본 열 없음"} />
                <RawTotal label="랜딩 조회" value={result.present.includes("landingPageViews") ? formatNumber(result.agg.landingPageViews) : "원본 열 없음"} />
                <RawTotal label="구매" value={result.present.includes("purchases") ? formatNumber(result.agg.purchases) : "원본 열 없음"} />
                <RawTotal label="구매 매출" value={result.present.includes("purchaseValue") ? formatKRW(result.agg.purchaseValue) : "원본 열 없음"} />
                <RawTotal label="3초 재생" value={result.present.includes("video3s") ? formatNumber(result.agg.video3s) : "원본 열 없음"} />
              </div>
              {result.reachEstimated && (
                <p className="mt-2 rounded-md bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">선택한 자료 간 도달 사용자가 중복될 수 있어, 합산 도달과 빈도는 참고용 추정값입니다.</p>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-1 text-sm font-bold text-slate-700">합산 성과지표</h3>
              <p className="mb-3 text-[11px] text-slate-400">비율 지표는 개별 자료 평균이 아니라, 원본값을 합산한 뒤 다시 계산했습니다. (빈도는 참고 지표)</p>
              <MetricGroups groups={result.groups} />
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-bold text-slate-700">공유용 요약</h3>
              <ShareSummaryCard analysis={synthAnalysis("합산 결과", result.agg, result.present, settings)} />
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
