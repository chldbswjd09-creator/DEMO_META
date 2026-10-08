// Meta 광고관리자 CSV의 열 이름 변형 → 사이트 표준 필드 매핑 설정.
// 한국어/영어, 버전별 변형을 여기에서 관리한다. (매핑 설정 파일)

export type IdField =
  | "accountName"
  | "accountId"
  | "campaignName"
  | "campaignId"
  | "adSetName"
  | "adSetId"
  | "adName"
  | "adId"
  | "adStatus"
  | "creativeType"
  | "date"
  | "reportStart"
  | "reportEnd"
  | "resultCount"
  | "resultIndicator";

export type PerfField =
  | "spend"
  | "impressions"
  | "reach"
  | "linkClicks"
  | "landingPageViews"
  | "purchases"
  | "purchaseValue"
  | "purchaseRoas"
  | "video3s"
  | "video25"
  | "video50"
  | "video75"
  | "video95"
  | "video100";

export type CanonicalField = IdField | PerfField;

export interface FieldSpec {
  key: CanonicalField;
  label: string;
  kind: "id" | "perf";
  // 필수 여부: 식별 필수는 대체 가능(예: 광고 이름 또는 ID) 하므로 group으로 관리
  requiredGroup?: string;
  numeric: boolean;
  variants: string[]; // 소문자 기준 변형 목록
}

// 필드별 정의 + 변형(소문자). 매칭은 정규화 후 exact/compact/startsWith/includes 순.
export const FIELD_SPECS: FieldSpec[] = [
  // ── 식별 열 ────────────────────────────────────────────────
  {
    key: "accountName",
    label: "광고계정 이름",
    kind: "id",
    numeric: false,
    variants: ["account name", "ad account name", "광고 계정 이름", "광고계정 이름", "계정 이름"],
  },
  {
    key: "accountId",
    label: "광고계정 ID",
    kind: "id",
    numeric: false,
    variants: ["account id", "ad account id", "광고 계정 id", "광고계정 id", "계정 id"],
  },
  {
    key: "campaignName",
    label: "캠페인 이름",
    kind: "id",
    numeric: false,
    variants: ["campaign name", "캠페인 이름", "캠페인명"],
  },
  {
    key: "campaignId",
    label: "캠페인 ID",
    kind: "id",
    numeric: false,
    variants: ["campaign id", "캠페인 id"],
  },
  {
    key: "adSetName",
    label: "광고세트 이름",
    kind: "id",
    numeric: false,
    variants: ["ad set name", "adset name", "광고 세트 이름", "광고세트 이름", "광고세트명"],
  },
  {
    key: "adSetId",
    label: "광고세트 ID",
    kind: "id",
    numeric: false,
    variants: ["ad set id", "adset id", "광고 세트 id", "광고세트 id"],
  },
  {
    key: "adName",
    label: "광고 이름",
    kind: "id",
    requiredGroup: "ad",
    numeric: false,
    variants: ["ad name", "광고 이름", "광고명", "소재 이름"],
  },
  {
    key: "adId",
    label: "광고 ID",
    kind: "id",
    requiredGroup: "ad",
    numeric: false,
    variants: ["ad id", "광고 id"],
  },
  {
    key: "adStatus",
    label: "광고 상태",
    kind: "id",
    numeric: false,
    variants: ["ad status", "delivery", "delivery status", "ad delivery", "광고 게재", "게재", "상태", "광고 상태"],
  },
  {
    key: "creativeType",
    label: "소재 유형",
    kind: "id",
    numeric: false,
    variants: ["ad creative type", "creative type", "소재 유형", "광고 유형", "형식"],
  },
  {
    key: "date",
    label: "날짜",
    kind: "id",
    numeric: false,
    variants: ["day", "date", "날짜", "일자", "일"],
  },
  {
    key: "reportStart",
    label: "보고 시작일",
    kind: "id",
    numeric: false,
    variants: ["reporting starts", "report start", "보고 시작", "보고 시작일", "시작일"],
  },
  {
    key: "reportEnd",
    label: "보고 종료일",
    kind: "id",
    numeric: false,
    variants: ["reporting ends", "report end", "보고 종료", "보고 종료일", "종료일"],
  },
  {
    // Meta '결과' 건수 열. 전용 구매 열이 없을 때만, 같은 행 '결과 표시 도구'가 purchase 인 경우
    // 구매 건수 fallback 으로 사용한다. (mapping.ts 가드로 '결과당 비용/결과 ROAS/결과 표시 도구'와 분리)
    key: "resultCount",
    label: "결과",
    kind: "id",
    numeric: false,
    variants: ["results", "result", "결과"],
  },
  {
    // Meta '결과 표시 도구'(결과 유형). 값이 purchase 임을 확인하는 용도로만 사용.
    key: "resultIndicator",
    label: "결과 표시 도구",
    kind: "id",
    numeric: false,
    variants: ["result indicator", "result type", "결과 표시 도구", "결과 유형", "지표 이름"],
  },

  // ── 원본 성과 열 ───────────────────────────────────────────
  {
    key: "spend",
    label: "광고비",
    kind: "perf",
    requiredGroup: "spend",
    numeric: true,
    variants: ["amount spent", "spend", "지출 금액", "광고비", "소진 금액", "사용 금액"],
  },
  {
    key: "impressions",
    label: "노출",
    kind: "perf",
    requiredGroup: "impressions",
    numeric: true,
    variants: ["impressions", "노출", "노출수", "노출 수"],
  },
  {
    key: "reach",
    label: "도달",
    kind: "perf",
    requiredGroup: "reach",
    numeric: true,
    variants: ["reach", "도달", "도달수", "도달 수"],
  },
  {
    key: "linkClicks",
    label: "링크 클릭",
    kind: "perf",
    numeric: true,
    variants: ["link clicks (all)", "link clicks", "outbound clicks", "링크 클릭 (전체)", "링크 클릭", "링크 클릭수", "링크클릭"],
  },
  {
    key: "landingPageViews",
    label: "랜딩페이지 조회",
    kind: "perf",
    numeric: true,
    variants: ["landing page views", "랜딩 페이지 조회", "랜딩페이지 조회", "랜딩 페이지 조회수", "랜딩페이지 조회수"],
  },
  {
    key: "purchases",
    label: "구매",
    kind: "perf",
    numeric: true,
    // '구매 ROAS'·'구매 전환값' 같은 열이 섞이지 않도록 단수 'purchase'는 제외한다.
    // 건수(count) 열만. 값/수익률/비용 마커가 있는 헤더는 mapping.ts 가드에서 차단된다.
    variants: ["website purchases", "purchases", "웹사이트 직접 구매", "웹사이트 구매", "구매", "구매 수", "구매수", "구매 건수"],
  },
  {
    key: "purchaseValue",
    label: "구매 매출",
    kind: "perf",
    numeric: true,
    variants: [
      "website purchases conversion value",
      "website purchase conversion value",
      "purchases conversion value",
      "purchase conversion value",
      "구매 전환값",
      "구매 전환 가치",
      "구매값",
      "웹사이트 구매 전환값",
      "웹사이트 직접 구매 전환값",
    ],
  },
  {
    // Meta 구매 ROAS(배수, ratio). 구매 수/매출과 별도로 관리한다. 화면 표시 시 ×100.
    key: "purchaseRoas",
    label: "구매 ROAS",
    kind: "perf",
    numeric: true,
    variants: [
      "website purchase roas",
      "website purchases roas",
      "purchase roas",
      "purchases roas",
      "웹사이트 구매 roas",
      "웹사이트 직접 구매 roas",
      "구매 roas",
      "구매 roas(광고 지출 대비 수익률)",
      "광고 지출 대비 수익률",
    ],
  },
  {
    key: "video3s",
    label: "3초 영상 재생",
    kind: "perf",
    numeric: true,
    variants: ["3-second video plays", "3 second video plays", "3초 이상 동영상 재생", "동영상 3초 이상 재생", "3초 동영상 재생", "동영상 재생 3초"],
  },
  {
    key: "video25",
    label: "영상 25% 재생",
    kind: "perf",
    numeric: true,
    variants: ["video plays at 25%", "동영상 25% 재생", "영상 25% 재생", "동영상 재생 25%"],
  },
  {
    key: "video50",
    label: "영상 50% 재생",
    kind: "perf",
    numeric: true,
    variants: ["video plays at 50%", "동영상 50% 재생", "영상 50% 재생", "동영상 재생 50%"],
  },
  {
    key: "video75",
    label: "영상 75% 재생",
    kind: "perf",
    numeric: true,
    variants: ["video plays at 75%", "동영상 75% 재생", "영상 75% 재생", "동영상 재생 75%"],
  },
  {
    key: "video95",
    label: "영상 95% 재생",
    kind: "perf",
    numeric: true,
    variants: ["video plays at 95%", "동영상 95% 재생", "영상 95% 재생", "동영상 재생 95%"],
  },
  {
    key: "video100",
    label: "영상 100% 재생",
    kind: "perf",
    numeric: true,
    variants: ["video plays at 100%", "동영상 100% 재생", "영상 100% 재생", "동영상 재생 100%"],
  },
];

export const FIELD_BY_KEY: Record<CanonicalField, FieldSpec> = Object.fromEntries(
  FIELD_SPECS.map((f) => [f.key, f]),
) as Record<CanonicalField, FieldSpec>;

// 성과 필드 목록
export const PERF_FIELDS: PerfField[] = FIELD_SPECS.filter((f) => f.kind === "perf").map(
  (f) => f.key as PerfField,
);

// 헤더 정규화
export function normalizeHeader(h: string): string {
  return h
    .replace(/^﻿/, "") // BOM
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function compact(h: string): string {
  return normalizeHeader(h).replace(/\s+/g, "").replace(/[()]/g, "");
}
