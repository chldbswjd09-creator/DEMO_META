// 여러 분석 자료 통합 — 동일 광고(광고 ID 우선, 없으면 이름)를 묶어 raw 합산 후 재계산.
// 추정 ROAS는 합산된 원본(구매매출/광고비)에서 산출한다. BEP ROAS는 통합 화면에서 공통 입력한다.

import type { AnalysisSettings, AggregatedInsight, CreativeType, MetricGroup, Verdict, VerdictCode } from "@/lib/types";
import { emptyAgg } from "@/lib/metrics/calc";
import { sumAgg } from "@/lib/csv/analyze";
import type { PerfField } from "@/lib/csv/columnMap";
import type { MaterialAnalysis } from "@/lib/materials/types";
import { metricGroupsForAgg, verdictForAgg, detectDuplicates, type DupKey } from "@/lib/materials/compute";
import { estRoasOf } from "@/lib/materials/profitView";
import { isRealCampaign } from "@/lib/materials/campaign";

export type DedupMode = "exclude" | "include";

export interface MergedAd {
  mergeKey: string;
  adId?: string;
  adName: string;
  creativeType: CreativeType;
  agg: AggregatedInsight;
  present: PerfField[];
  spend: number;
  groups: MetricGroup[];
  verdict: Verdict;
  estimatedRoas: number | null; // 추정 ROAS (합산 CSV)
  periods: { start: string; end: string }[]; // 이 소재가 실제로 등장한 자료들의 기간(중복 제외 후)
  // 이 소재가 속한 캠페인명(고유). 동일 광고 ID가 서로 다른 캠페인명을 가지면 임의로 숨기지 않고 모두 보존한다.
  campaignNames: string[];
}

export interface IntegrateResult {
  merged: MergedAd[];
  materials: { id: string; name: string }[];
  totalSpend: number;
  totalAgg: AggregatedInsight; // 통합 총계 원본(합산) — KPI(CTR/CPC/CVR) 재계산용
  present: PerfField[]; // 선택 자료 교집합 원본 열
  integratedEstimatedRoas: number | null; // 통합 추정 ROAS (합산 CSV)
  duplicates: DupKey[];
  periodOverlap: boolean;
}

// 통합 판정 — '화면에 표시되는' 통합 ROAS와 입력 BEP ROAS만 비교한다. (데이터 충분도 등으로 덮어쓰지 않음)
// ROAS >= BEP → 유지, ROAS < BEP → 중단 검토, ROAS/BEP 계산·입력 불가 → 추가 관찰
// 표시(소수 1자리)와 판정이 어긋나지 않도록 ROAS를 표시 정밀도로 반올림해 비교한다.
export function integratedVerdict(roas: number | null, bepRoas: number | null): VerdictCode {
  if (roas == null || bepRoas == null) return "monitor";
  const shown = Math.round(roas * 10) / 10; // 표시 ROAS(소수 1자리)와 동일 기준으로 비교
  return shown >= bepRoas ? "keep" : "pause_candidate";
}

// 동일 광고 병합 키 — 광고 ID 우선, 없으면 정규화 이름. (기간 비교 등에서 재사용)
export function mergeKeyOf(adId: string | undefined, adName: string): string {
  return adId ? `id:${adId}` : `nm:${adName.trim()}`;
}
function dedupKeyOf(adId: string | undefined, adName: string, m: MaterialAnalysis): string {
  return `${mergeKeyOf(adId, adName)}||${m.periodStart ?? ""}||${m.periodEnd ?? ""}`;
}

function overlaps(a: MaterialAnalysis, b: MaterialAnalysis): boolean {
  if (!a.periodStart || !a.periodEnd || !b.periodStart || !b.periodEnd) return false;
  return a.periodStart <= b.periodEnd && b.periodStart <= a.periodEnd;
}
export function detectPeriodOverlap(mats: MaterialAnalysis[]): boolean {
  for (let i = 0; i < mats.length; i++) for (let j = i + 1; j < mats.length; j++) if (overlaps(mats[i], mats[j])) return true;
  return false;
}

export function integrate(mats: MaterialAnalysis[], mode: DedupMode, settings: AnalysisSettings): IntegrateResult {
  // 원본 열 present는 선택 자료 교집합
  let present: PerfField[] | null = null;
  for (const m of mats) present = present === null ? [...m.present] : present.filter((f) => m.present.includes(f));
  const presentArr = present ?? [];

  const duplicates = detectDuplicates(mats);
  const seen = new Set<string>();

  interface Acc {
    adId?: string;
    adName: string;
    creativeType: CreativeType;
    agg: AggregatedInsight;
    periods: { start: string; end: string }[];
    campaigns: string[]; // 고유 캠페인명(등장 순서)
  }
  const byKey = new Map<string, Acc>();

  for (const m of mats) {
    for (const ad of m.ads) {
      const dk = dedupKeyOf(ad.adId, ad.adName, m);
      if (mode === "exclude" && seen.has(dk)) continue;
      seen.add(dk);

      const mk = mergeKeyOf(ad.adId, ad.adName);
      const acc = byKey.get(mk) ?? { adId: ad.adId, adName: ad.adName, creativeType: ad.creativeType, agg: emptyAgg(), periods: [], campaigns: [] };
      acc.agg = sumAgg(acc.agg, ad.agg);
      if (m.periodStart && m.periodEnd) acc.periods.push({ start: m.periodStart, end: m.periodEnd });
      if (ad.creativeType === "video") acc.creativeType = "video";
      // 캠페인명 보존(고유). 서로 다른 캠페인명이면 모두 유지(임의 선택/숨김 금지 — 스펙 12).
      // 빈값/자리표시자('(캠페인 없음)')는 실제 캠페인명이 아니므로 제외한다.
      const cn = (ad.campaignName ?? "").trim();
      if (isRealCampaign(cn) && !acc.campaigns.includes(cn)) acc.campaigns.push(cn);
      byKey.set(mk, acc);
    }
  }

  const merged: MergedAd[] = [...byKey.entries()].map(([mk, acc]) => ({
    mergeKey: mk,
    adId: acc.adId,
    adName: acc.adName,
    creativeType: acc.creativeType,
    agg: acc.agg,
    present: presentArr,
    spend: acc.agg.spend,
    groups: metricGroupsForAgg(acc.agg, presentArr),
    verdict: verdictForAgg(acc.agg, presentArr, settings),
    estimatedRoas: estRoasOf(acc.agg, presentArr),
    periods: acc.periods,
    campaignNames: acc.campaigns,
  }));

  const totalSpend = merged.reduce((s, a) => s + a.spend, 0);
  let totalAgg = emptyAgg();
  for (const a of merged) totalAgg = sumAgg(totalAgg, a.agg);
  const integratedEstimatedRoas = estRoasOf(totalAgg, presentArr);

  return {
    merged: merged.sort((a, b) => b.spend - a.spend),
    materials: mats.map((m) => ({ id: m.id, name: m.name })),
    totalSpend,
    totalAgg,
    present: presentArr,
    integratedEstimatedRoas,
    duplicates,
    periodOverlap: detectPeriodOverlap(mats),
  };
}
