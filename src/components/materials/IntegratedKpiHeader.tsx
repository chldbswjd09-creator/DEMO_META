"use client";

// 통합 광고 성과 — 캡처용 상단 KPI 블록 + ROAS vs BEP ROAS 그래프.
// 숫자를 크게, 항목명 명확, 긴 설명 없이 한눈에 읽히도록 구성한다.

import type { MetricResult } from "@/lib/types";
import { formatPct } from "@/lib/metrics/format";
import { RoasBepChart, type RoasBepData } from "@/components/materials/RoasBepChart";
import { cn } from "@/lib/cn";

function won(n: number | null): string {
  if (n == null) return "계산 불가";
  return `₩${Math.round(n).toLocaleString("ko-KR")}`;
}
function pct(n: number | null, digits: number): string {
  return n == null ? "계산 불가" : formatPct(n, digits);
}
// 계산 불가(열 없음/분모 0 등)는 0으로 표시하지 않는다.
function metricPct(m: MetricResult | undefined, digits: number): string {
  if (!m || m.state !== "ok" || m.current == null) return "계산 불가";
  return formatPct(m.current, digits);
}
function metricWon(m: MetricResult | undefined): string {
  if (!m || m.state !== "ok" || m.current == null) return "계산 불가";
  return won(m.current);
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={cn("mt-0.5 whitespace-nowrap text-2xl font-bold leading-tight", tone ?? "text-slate-900")}>{value}</p>
    </div>
  );
}

export interface IntegratedKpiHeaderProps {
  materialCount: number;
  adCount: number;
  spend: number;
  roas: number | null; // 통합 ROAS
  bepRoas: number | null; // 입력 BEP ROAS
  cpm: MetricResult | undefined; // 통합 CPM(총 광고비/총 노출×1000, 지표 엔진 값 재사용)
  ctr: MetricResult | undefined;
  cpc: MetricResult | undefined;
  cvr: MetricResult | undefined; // 구매전환율
  graph: RoasBepData;
}

export function IntegratedKpiHeader({ materialCount, adCount, spend, roas, bepRoas, cpm, ctr, cpc, cvr, graph }: IntegratedKpiHeaderProps) {
  const roasTone =
    roas == null || bepRoas == null ? "text-slate-900" : roas >= bepRoas ? "text-emerald-600" : "text-rose-600";

  return (
    <section className="rounded-xl border-2 border-slate-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-800">통합 광고 성과</h2>
        <p className="text-xs text-slate-400">선택 자료 {materialCount}개 · 통합 광고 {adCount}개</p>
      </div>

      {/* 1행: 광고비·CPM·CTR·CPC / 2행: 구매전환율·ROAS·BEP ROAS (4열, 지나친 벌어짐 방지) */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Kpi label="광고비" value={won(spend)} />
        <Kpi label="CPM" value={metricWon(cpm)} />
        <Kpi label="CTR" value={metricPct(ctr, 2)} />
        <Kpi label="CPC" value={metricWon(cpc)} />
        <Kpi label="구매전환율" value={metricPct(cvr, 2)} />
        <Kpi label="ROAS" value={pct(roas, 1)} tone={roasTone} />
        <Kpi label="BEP ROAS" value={bepRoas == null ? "미입력" : formatPct(bepRoas, 1)} tone={bepRoas == null ? "text-slate-400" : undefined} />
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <RoasBepChart p={graph} />
      </div>
    </section>
  );
}
