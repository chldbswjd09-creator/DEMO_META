// 캠페인명 표시/검색 헬퍼 (순수 함수 — 계산·판정과 무관, UI 표시 전용).
// 표시 우선순위: CSV 자동 캠페인명 > 수기(manualCampaignName) > '캠페인명 미등록'.
// CSV 캠페인명은 각 광고 row(MaterialAdRow.campaignName)에서 유도한다(별도 저장 불필요).

export const NO_CAMPAIGN_LABEL = "캠페인명 미등록";

// dataset.ts 가 '캠페인 열이 없거나 값이 비었을 때' 각 행에 채우는 자리표시자.
// 이 값은 '실제 CSV 캠페인명'이 아니므로, 표시/검색/정렬/병합에서 빈값과 동일하게 취급한다.
// (기존 CSV 파싱 로직은 변경하지 않고, 여기서 정규화만 한다.)
export const CSV_EMPTY_CAMPAIGN = "(캠페인 없음)";

// 실제 캠페인명인지 — 빈 문자열/공백/자리표시자는 캠페인명 '없음'으로 본다.
export function isRealCampaign(name: string | undefined | null): boolean {
  const t = (name ?? "").trim();
  return t !== "" && t !== CSV_EMPTY_CAMPAIGN;
}

// 표시/정렬용 정규화 — 실제 캠페인명이면 trim 값, 아니면 빈 문자열.
export function normalizeCampaign(name: string | undefined | null): string {
  return isRealCampaign(name) ? (name as string).trim() : "";
}

// 광고들의 캠페인명에서 '실제' 고유값만 등장 순서대로 추출(빈값·자리표시자 제외).
export function uniqueCampaigns(names: (string | undefined | null)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    if (!isRealCampaign(n)) continue; // 빈값/자리표시자 제외
    const t = (n as string).trim();
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

export type CampaignSource = "csv" | "manual" | "none";
export interface CampaignDisplay {
  label: string; // 목록에 짧게 표시할 값 (예: "MZ_메인 외 2개")
  full: string[]; // 전체 캠페인명 목록 (hover/title용)
  source: CampaignSource;
}

// 자료 단위 최종 표시 캠페인명 계산.
export function displayCampaign(csvCampaigns: string[], manual?: string | null): CampaignDisplay {
  if (csvCampaigns.length > 0) {
    const label = csvCampaigns.length === 1 ? csvCampaigns[0] : `${csvCampaigns[0]} 외 ${csvCampaigns.length - 1}개`;
    return { label, full: csvCampaigns, source: "csv" };
  }
  const m = (manual ?? "").trim();
  if (m) return { label: m, full: [m], source: "manual" };
  return { label: NO_CAMPAIGN_LABEL, full: [], source: "none" };
}

// 검색 대상 텍스트 (CSV 캠페인명 + 수기 캠페인명, 소문자).
export function campaignSearchText(csvCampaigns: string[], manual?: string | null): string {
  const m = (manual ?? "").trim();
  return [...csvCampaigns, ...(m ? [m] : [])].join(" \n ").toLowerCase();
}

// 부분 일치(대소문자 무시). 빈 검색어는 항상 true.
export function campaignMatches(query: string, csvCampaigns: string[], manual?: string | null): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return campaignSearchText(csvCampaigns, manual).includes(q);
}

// 통합 리스트(MergedAd)용: 여러 캠페인명을 한 줄 표시값 + 전체로 변환.
export function mergedCampaignDisplay(campaignNames: string[]): CampaignDisplay {
  return displayCampaign(campaignNames, null);
}
