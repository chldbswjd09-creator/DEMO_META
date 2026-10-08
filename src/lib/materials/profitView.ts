// 공통 수익성 계산 결과 — 그래프·공유용 요약·자동진단·상세가 모두 재사용한다.
// 추정 ROAS = CSV(구매매출/광고비) 산출, BEP ROAS = 사용자가 직접 입력(자료 공통).

import type { AggregatedInsight, CreativeType } from "@/lib/types";
import type { PerfField } from "@/lib/csv/columnMap";
import type { MaterialAdRow, ProfitRecord } from "@/lib/materials/types";
import type { ProfitVerdict } from "@/lib/materials/profit";
import { profitVerdictOf } from "@/lib/materials/profitCopy";

export interface AdProfitView {
  key: string;
  adName: string;
  creativeType: CreativeType;
  estimatedRoas: number | null; // 추정 ROAS (CSV)
  bepRoas: number | null; // 입력된 BEP ROAS (자료 공통)
  diffPp: number | null; // 추정 ROAS − BEP ROAS
  verdict: ProfitVerdict;
  metaRoas: number | null; // 참고값
}

export interface MaterialProfit {
  bepRoas: number | null;
  byKey: Map<string, AdProfitView>;
}

// 추정 ROAS = CSV에서 산출 (구매 전환값/광고비, 없으면 구매 ROAS 역산금액/광고비)
export function estRoasOf(agg: AggregatedInsight, present: PerfField[]): number | null {
  if (agg.spend <= 0) return null;
  if (present.includes("purchaseValue") && agg.purchaseValue > 0) return (agg.purchaseValue / agg.spend) * 100;
  if (present.includes("purchaseRoas") && agg.metaRevenueEst > 0) return (agg.metaRevenueEst / agg.spend) * 100;
  return null;
}

// Meta ROAS = 참고값. 구매 ROAS 열이 있으면 역산 금액 기준, 없으면 구매 매출/광고비.
export function metaRoasOf(agg: AggregatedInsight, present: PerfField[]): number | null {
  if (present.includes("purchaseRoas") && agg.spend > 0 && agg.metaRevenueEst > 0)
    return (agg.metaRevenueEst / agg.spend) * 100;
  if (agg.spend > 0 && agg.purchaseValue > 0) return (agg.purchaseValue / agg.spend) * 100;
  return null;
}

function viewOf(
  key: string,
  adName: string,
  creativeType: CreativeType,
  agg: AggregatedInsight,
  present: PerfField[],
  bepRoas: number | null,
): AdProfitView {
  const est = estRoasOf(agg, present);
  const diffPp = est != null && bepRoas != null ? est - bepRoas : null;
  return {
    key,
    adName,
    creativeType,
    estimatedRoas: est,
    bepRoas,
    diffPp,
    verdict: profitVerdictOf(est, bepRoas),
    metaRoas: metaRoasOf(agg, present),
  };
}

export function computeMaterialProfit(
  ads: MaterialAdRow[],
  present: PerfField[],
  record: ProfitRecord | null,
): MaterialProfit {
  const bepRoas = record?.bepRoas ?? null;
  const byKey = new Map<string, AdProfitView>();
  for (const a of ads) byKey.set(a.key, viewOf(a.key, a.adName, a.creativeType, a.agg, present, bepRoas));
  return { bepRoas, byKey };
}

// 자료 전체(합산) 수익성 — 자료 전체 공유용 요약/판정에서 사용.
export function computeOverallProfit(
  total: AggregatedInsight,
  present: PerfField[],
  record: ProfitRecord | null,
): AdProfitView {
  return viewOf("__overall__", "자료 전체", "other", total, present, record?.bepRoas ?? null);
}

// 임의 agg + 공통 BEP ROAS로 수익성 뷰 생성 (통합 병합 광고 등).
export function profitViewFor(
  key: string,
  adName: string,
  creativeType: CreativeType,
  agg: AggregatedInsight,
  present: PerfField[],
  bepRoas: number | null,
): AdProfitView {
  return viewOf(key, adName, creativeType, agg, present, bepRoas);
}

// 집행 경과일 (시작~종료 포함 일수). 시작일 없으면 null.
export function elapsedDays(start?: string, end?: string): number | null {
  if (!start) return null;
  const s = Date.parse(start);
  const e = end ? Date.parse(end) : s;
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  return Math.floor((e - s) / 86_400_000) + 1;
}
