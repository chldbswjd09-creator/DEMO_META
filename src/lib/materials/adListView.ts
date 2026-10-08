// 상세페이지 왼쪽 광고 리스트의 정렬/필터 (순수 로직 — 표시 대상만 변경, 계산·판정 불변).
// 정렬 기준: 광고명순 / 캠페인명순. 필터: 운영 상태 + 성과 판정(1차 판정).

import type { AdStatus } from "@/lib/materials/adStatus";
import type { VerdictCode } from "@/lib/types";
import { naturalCompare } from "@/lib/natural";
import { normalizeCampaign } from "@/lib/materials/campaign";

export type AdSortKey = "ad" | "campaign";
// 성과 판정 필터는 통합 광고 비교의 1차 판정(유지/중단 검토/추가 관찰) 기준을 그대로 사용한다.
export type VerdictFilter = "all" | "keep" | "pause_candidate" | "monitor";
export type StatusFilter = "all" | AdStatus;

// 캠페인명순 정렬: (1) 캠페인명 자연정렬 → (2) 동일 캠페인 내 광고명 자연정렬.
// 캠페인명 미등록(빈값)은 항상 가장 아래.
export function compareByCampaign(aCamp: string, aName: string, bCamp: string, bName: string): number {
  const ac = normalizeCampaign(aCamp); // 빈값/자리표시자 → "" (미등록)
  const bc = normalizeCampaign(bCamp);
  const ae = ac === "";
  const be = bc === "";
  if (ae !== be) return ae ? 1 : -1; // 미등록은 뒤로
  if (!ae) {
    const c = naturalCompare(ac, bc);
    if (c !== 0) return c;
  }
  return naturalCompare(aName, bName);
}

export function compareByAd(aName: string, bName: string): number {
  return naturalCompare(aName, bName);
}

// 운영 상태 + 성과 판정 통과 여부. verdict 미상(undefined)은 'all'에서만 통과.
export function passFilters(
  status: AdStatus,
  verdict: VerdictCode | undefined,
  statusFilter: StatusFilter,
  verdictFilter: VerdictFilter,
): boolean {
  if (statusFilter !== "all" && status !== statusFilter) return false;
  if (verdictFilter !== "all" && verdict !== verdictFilter) return false;
  return true;
}
