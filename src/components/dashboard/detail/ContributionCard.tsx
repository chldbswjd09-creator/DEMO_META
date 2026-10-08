"use client";

import { useState } from "react";
import type { Contribution } from "@/lib/types";
import { formatPct } from "@/lib/metrics/format";
import { cn } from "@/lib/cn";

const SCOPE_LABEL: Record<Contribution["scope"], string> = {
  adset: "동일 광고세트",
  campaign: "동일 캠페인",
  account: "전체 광고계정",
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-1.5 text-xs last:border-0">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}

function diffTone(v: number | null): string {
  if (v === null) return "text-slate-400";
  if (v > 5) return "text-emerald-600";
  if (v < -5) return "text-rose-600";
  return "text-slate-600";
}

function fmtDiff(v: number | null): string {
  if (v === null) return "계산 불가";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%p`;
}

// contributions: 미리 계산된 범위별 기여도 (adset/campaign/account)
export function ContributionCard({
  contributions,
}: {
  contributions: Record<Contribution["scope"], Contribution>;
}) {
  const [scope, setScope] = useState<Contribution["scope"]>("adset");
  const c = contributions[scope];

  const interpretation = (() => {
    if (!c.canCalc || c.spendShare === null) return "비교 범위의 데이터가 부족해 기여도를 계산할 수 없습니다.";
    if (c.revenueContribution === null && c.purchaseContribution === null)
      return "비교 범위의 구매/매출이 없어 기여도를 계산할 수 없습니다(계산 불가).";
    const rv = c.revenueVsSpend;
    if (rv !== null && rv > 5)
      return `광고비 비중 ${formatPct(c.spendShare)}에 비해 매출 기여도(${c.revenueContribution !== null ? formatPct(c.revenueContribution) : "-"})가 높아, 비용 비중 대비 성과 기여도가 높은 광고로 판단됩니다.`;
    if (rv !== null && rv < -5)
      return `광고비 비중 ${formatPct(c.spendShare)}에 비해 구매·매출 기여도가 낮아 효율 점검이 필요한 광고로 판단됩니다.`;
    return "광고비 비중과 구매·매출 기여도가 비슷한 수준입니다.";
  })();

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] text-slate-500">비교 범위</span>
        <div className="flex overflow-hidden rounded-md border border-slate-300 text-[11px]">
          {(Object.keys(SCOPE_LABEL) as Contribution["scope"][]).map((s) => (
            <button
              key={s}
              onClick={() => setScope(s)}
              className={cn("px-2.5 py-1", scope === s ? "bg-brand text-white" : "bg-white text-slate-600 hover:bg-slate-50")}
            >
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <Row label="광고비 비중" value={c.spendShare !== null ? formatPct(c.spendShare) : "계산 불가"} />
          <Row label="구매 기여도" value={c.purchaseContribution !== null ? formatPct(c.purchaseContribution) : "계산 불가"} />
          <Row label="매출 기여도" value={c.revenueContribution !== null ? formatPct(c.revenueContribution) : "계산 불가"} />
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between border-b border-slate-100 py-1.5 text-xs">
            <span className="text-slate-500">구매 기여도 − 광고비 비중</span>
            <span className={cn("font-semibold", diffTone(c.purchaseVsSpend))}>{fmtDiff(c.purchaseVsSpend)}</span>
          </div>
          <div className="flex items-center justify-between py-1.5 text-xs">
            <span className="text-slate-500">매출 기여도 − 광고비 비중</span>
            <span className={cn("font-semibold", diffTone(c.revenueVsSpend))}>{fmtDiff(c.revenueVsSpend)}</span>
          </div>
        </div>
      </div>

      <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">{interpretation}</p>
    </div>
  );
}
