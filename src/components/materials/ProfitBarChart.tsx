"use client";

// 소재별 수익성 비교 — 추정 ROAS(막대) vs 입력 BEP ROAS(기준선). 숫자 비교가 목적.
// 데이터 없음은 0%로 그리지 않고 안내 문구로 대체한다.

import { useMemo } from "react";
import type { ProfitVerdict } from "@/lib/materials/profit";
import { formatPct } from "@/lib/metrics/format";
import { diffPpText } from "@/lib/materials/profitCopy";
import { cn } from "@/lib/cn";

export interface ProfitBarRow {
  key: string;
  name: string;
  estimatedRoas: number | null;
  bepRoas: number | null;
  diffPp: number | null;
  verdict: ProfitVerdict;
  tags?: string[];
}

const BAR_TONE: Record<string, string> = {
  "BEP 초과": "bg-emerald-500",
  "BEP 미달": "bg-rose-500",
  손익분기: "bg-slate-400",
};
const DIFF_TONE = (d: number | null) =>
  d == null ? "text-slate-400" : d > 0 ? "text-emerald-600" : d < 0 ? "text-rose-600" : "text-slate-500";

function sortRows(rows: ProfitBarRow[]): ProfitBarRow[] {
  // 1) 추정 ROAS − BEP ROAS 큰 순 → 2) 추정만 있는 행 → 3) 추정 없음
  const rank = (r: ProfitBarRow) => (r.diffPp != null ? 0 : r.estimatedRoas != null ? 1 : 2);
  return [...rows].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return (b.diffPp as number) - (a.diffPp as number);
    return (b.estimatedRoas ?? 0) - (a.estimatedRoas ?? 0);
  });
}

export function ProfitBarChart({ rows, title = "소재별 수익성 비교" }: { rows: ProfitBarRow[]; title?: string }) {
  const sorted = useMemo(() => sortRows(rows), [rows]);
  const scaleMax = useMemo(() => {
    let m = 100;
    for (const r of rows) {
      if (r.estimatedRoas != null) m = Math.max(m, r.estimatedRoas);
      if (r.bepRoas != null) m = Math.max(m, r.bepRoas);
    }
    return m * 1.08;
  }, [rows]);

  const anyComparable = rows.some((r) => r.estimatedRoas != null);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-1 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">{title}</h3>
        <span className="text-[10px] text-slate-400">막대 = 추정 ROAS · 세로선 = BEP ROAS</span>
      </div>

      {!anyComparable ? (
        <p className="mt-2 rounded-md bg-slate-50 px-3 py-3 text-center text-[11px] text-slate-500">
          CSV에 구매 매출 데이터가 없어 추정 ROAS를 계산할 수 없습니다.
        </p>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {sorted.map((r) => {
            const estPct = r.estimatedRoas != null ? Math.min(100, (r.estimatedRoas / scaleMax) * 100) : 0;
            const bepPct = r.bepRoas != null ? Math.min(100, (r.bepRoas / scaleMax) * 100) : null;
            return (
              <li key={r.key}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="clamp-1 min-w-0 text-xs font-semibold text-slate-800" title={r.name}>{r.name}</span>
                  <span className="shrink-0 whitespace-nowrap text-[11px]">
                    {r.estimatedRoas != null ? (
                      <>
                        <span className="font-semibold text-slate-800">추정 {formatPct(r.estimatedRoas)}</span>
                        <span className="text-slate-400"> · BEP {r.bepRoas != null ? formatPct(r.bepRoas) : "입력 필요"}</span>
                        {r.diffPp != null && <span className={cn("ml-1 font-semibold", DIFF_TONE(r.diffPp))}>{diffPpText(r.diffPp)}</span>}
                      </>
                    ) : (
                      <span className="text-slate-400">추정 ROAS 계산 불가</span>
                    )}
                  </span>
                </div>

                {r.estimatedRoas != null ? (
                  <div className="relative mt-1 h-3.5 w-full overflow-hidden rounded bg-slate-100">
                    <div className={cn("h-full rounded", BAR_TONE[r.verdict] ?? "bg-slate-400")} style={{ width: `${estPct}%` }} />
                    {bepPct != null && (
                      <div className="absolute top-0 h-full border-l-2 border-slate-700" style={{ left: `${bepPct}%` }} title={`BEP ROAS ${formatPct(r.bepRoas as number)}`} />
                    )}
                  </div>
                ) : (
                  <p className="mt-1 rounded bg-slate-50 px-2 py-1 text-[10px] text-slate-400">CSV 구매 매출 없음 — 추정 ROAS 계산 불가</p>
                )}

                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  {r.estimatedRoas != null && r.bepRoas == null && (
                    <span className="text-[10px] text-slate-400">BEP ROAS 입력 후 수익성 비교가 표시됩니다.</span>
                  )}
                  {(r.tags ?? []).map((t) => (
                    <span key={t} className="rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-500">{t}</span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-2 text-[10px] text-slate-400">추정 ROAS − BEP ROAS가 큰(수익성이 좋은) 소재부터 정렬됩니다.</p>
    </section>
  );
}
