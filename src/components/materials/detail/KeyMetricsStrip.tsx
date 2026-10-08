"use client";

// ③ 핵심 성과 — 실무자가 가장 자주 보는 지표만 compact 하게 한 줄(반응형 그리드)로.
// 값은 기존 계산 결과(groups/agg/profit)를 그대로 표시(재계산 없음). CPM 등 보조 지표는 넣지 않는다.

import type { AggregatedInsight, MetricGroup } from "@/lib/types";
import type { PerfField } from "@/lib/csv/columnMap";
import type { AdProfitView } from "@/lib/materials/profitView";
import { findMetric } from "@/lib/metrics/calc";
import { effectivePresent } from "@/lib/csv/analyze";
import { formatMetricValue, formatNumber, formatPct } from "@/lib/metrics/format";
import { cn } from "@/lib/cn";

function metricText(groups: MetricGroup[], key: string): string {
  const m = findMetric(groups, key);
  return m ? formatMetricValue(m) : "-";
}

function Cell({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={cn("truncate", strong ? "text-lg font-bold" : "text-base font-semibold", tone ?? "text-slate-900")} title={value}>{value}</p>
    </div>
  );
}

export function KeyMetricsStrip({
  cur,
  present,
  groups,
  profit,
}: {
  cur: AggregatedInsight;
  present?: PerfField[];
  groups: MetricGroup[];
  profit?: AdProfitView | null;
}) {
  const eff = present ? effectivePresent(cur, present) : undefined;
  const has = (f: PerfField) => !eff || eff.includes(f);
  const impr = has("impressions") ? formatNumber(cur.impressions) : "원본 열 없음";
  const purch = has("purchases") ? `${formatNumber(cur.purchases)}건` : "원본 열 없음";

  // ROAS: 기존 추정 ROAS(profit) 우선, 없으면 지표 엔진 값. (둘 다 구매매출/광고비 동일 계산)
  const est = profit?.estimatedRoas ?? null;
  const roasText = profit ? (est == null ? "계산 불가" : formatPct(est)) : metricText(groups, "roas");
  const bep = profit?.bepRoas ?? null;
  const diff = profit?.diffPp ?? null;

  const bepLine = (() => {
    if (!profit || est == null) return { text: "ROAS 계산 불가로 수익성 비교 불가", tone: "text-slate-500" };
    if (bep == null) return { text: `BEP ROAS 미입력 → 수익성 비교 불가`, tone: "text-amber-600" };
    const verdict = diff == null ? "" : diff >= 0 ? "BEP 초과" : "BEP 미달";
    const tone = diff == null ? "text-slate-500" : diff >= 0 ? "text-emerald-600" : "text-rose-600";
    return { text: `ROAS ${formatPct(est)} vs BEP ${formatPct(bep)} → ${verdict}`, tone };
  })();

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4 lg:grid-cols-8">
        <Cell label="노출" value={impr} />
        <Cell label="CPM" value={metricText(groups, "cpm")} />
        <Cell label="CTR" value={metricText(groups, "ctr")} />
        <Cell label="CPC" value={metricText(groups, "cpc")} />
        <Cell label="구매" value={purch} />
        <Cell label="CVR" value={metricText(groups, "purchaseRate")} />
        <Cell label="CPA" value={metricText(groups, "cpa")} />
        <Cell label="ROAS" value={roasText} strong tone={est == null ? "text-slate-400" : undefined} />
      </div>
      <p className={cn("mt-2 border-t border-slate-100 pt-2 text-xs font-semibold", bepLine.tone)}>{bepLine.text}</p>
    </section>
  );
}
