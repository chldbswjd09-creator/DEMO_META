// ─────────────────────────────────────────────────────────────
// 도메인 타입 정의
// 실제 API 연동 시에도 그대로 재사용할 수 있도록 UI/저장소와 분리한다.
// ─────────────────────────────────────────────────────────────

export type AccessType = "owner" | "shared";
export type AssetStatus = "active" | "inactive";
export type CreativeType = "image" | "video" | "carousel" | "other";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

export interface BusinessPortfolio {
  id: string;
  name: string;
  accessType: AccessType;
}

export interface AdAccount {
  id: string; // act_xxx
  portfolioId: string;
  name: string;
  currency: string; // KRW 등
  timezone: string;
  status: AssetStatus;
  accessType: AccessType;
  lastSyncedAt: string; // ISO
}

export interface Campaign {
  id: string;
  adAccountId: string;
  name: string;
  status: AssetStatus;
  objective: string;
}

export interface AdSet {
  id: string;
  campaignId: string;
  name: string;
  status: AssetStatus;
}

export interface Ad {
  id: string;
  adSetId: string;
  name: string;
  status: AssetStatus;
  creativeType: CreativeType;
  thumbnailUrl?: string;
  createdTime: string; // ISO (집행 시작일)
}

// 원본(raw) 일별 성과 — Meta insights 매핑 대상
export interface DailyInsight {
  date: string; // YYYY-MM-DD (계정 타임존 기준)
  adId: string;
  spend: number;
  impressions: number;
  reach: number;
  linkClicks: number;
  landingPageViews: number;
  purchases: number;
  purchaseValue: number;
  currency: string;
  conversionComplete: boolean; // 전환 데이터 수집 완전성
}

export interface VideoInsight {
  date: string;
  adId: string;
  video3s: number;
  video50: number;
  video100: number;
  videoComplete: boolean;
}

// 분석 기준값 (광고계정별 설정 — 코드 고정 금지)
export interface AnalysisSettings {
  targetCpa: number;
  targetRoas: number; // %
  baseCtr: number; // %
  baseCpc: number;
  baseLandingRate: number; // %
  baseLandingCost: number;
  basePurchaseRate: number; // %
  baseHookRate: number; // %
  baseHoldRate: number; // %
  baseCompletionRate: number; // %
  minSpend: number;
  minImpressions: number;
  minLinkClicks: number;
  minLandingViews: number;
  minPurchases: number;
  baseObservationDays: number;
  extraObservationDays: number;
  fatigueFrequency: number;
  attributionWindow: string; // 예: "7d_click_1d_view"
  // 판정 엔진 튜닝값 (코드에 직접 쓰지 않고 설정으로 분리)
  significantChangePct: number; // 증감률이 '의미 있는 변화'로 간주되는 임계(%)
  pauseRoasRatio: number; // 목표 ROAS 대비 이 비율 미만이면 중단 검토 (예: 0.5)
  strongContributionGapPct: number; // 매출 기여도 - 광고비 비중 이 값 초과면 확장 후보(%p)
}

// 성과 판정 코드
export type VerdictCode =
  | "scale_candidate"
  | "keep"
  | "monitor"
  | "pause_candidate"
  | "data_insufficient"
  | "creative_fatigue"
  | "creative_issue"
  | "landing_issue"
  | "tracking_issue";

export type MetricUnit = "krw" | "pct" | "ratio" | "count" | "krw_per_1000";

// 지표 계산 결과의 상태 (예외 처리)
export type MetricState =
  | "ok"
  | "na" // 적용 대상 아님 (예: 이미지 광고의 영상 지표)
  | "no_data" // 데이터 없음
  | "cannot_calc" // 분모 0 등 계산 불가
  | "no_purchase" // 구매 0 (0원으로 표기하지 않음)
  | "missing_column"; // CSV에 해당 원본 열이 없음

export type ChangeNote = "normal" | "new" | "no_previous";

export interface MetricResult {
  key: string;
  label: string;
  unit: MetricUnit;
  direction: "higher_better" | "lower_better" | "neutral";
  current: number | null;
  previous: number | null;
  state: MetricState;
  changePct: number | null;
  changeNote: ChangeNote;
  // 툴팁용
  meaning: string;
  formula: string;
  source: string;
  interpret: string;
}

export type MetricGroupKey =
  | "reach"
  | "click"
  | "landing"
  | "purchase"
  | "revenue"
  | "video";

export interface MetricGroup {
  key: MetricGroupKey;
  label: string;
  metrics: MetricResult[];
}

// 성과 기여도
export interface Contribution {
  scope: "adset" | "campaign" | "account";
  spendShare: number | null;
  purchaseContribution: number | null;
  revenueContribution: number | null;
  purchaseVsSpend: number | null; // 구매기여 - 광고비비중
  revenueVsSpend: number | null;
  canCalc: boolean;
}

export interface Verdict {
  code: VerdictCode;
  confidence: "높음" | "보통" | "낮음";
  dataSufficiency: "충분" | "제한적" | "부족";
  reasons: string[]; // 최대 3
  action: string;
  caution?: string;
}

// 값이 어디에서 왔는지 추적 (디버깅/재현용). 임의 생성 금지 원칙을 코드로 남긴다.
// - direct_*_column: 원본 CSV의 전용 열에서 그대로 읽음
// - result_purchase_fallback: 전용 구매 열은 없지만 '결과'가 purchase 유형이라 '결과' 값을 사용
// - unavailable: 원본에 근거가 없어 값이 없음(0으로 만들지 않음)
export type PurchasesSource = "direct_purchase_column" | "result_purchase_fallback" | "unavailable";
export type PurchaseValueSource = "direct_purchase_value_column" | "unavailable";
export type MetaRoasSource = "direct_meta_roas_column" | "unavailable";

// 집계된 raw 합계 (기간 단위)
export interface AggregatedInsight {
  spend: number;
  impressions: number;
  reach: number;
  linkClicks: number;
  landingPageViews: number;
  purchases: number;
  purchaseValue: number;
  video3s: number;
  video25: number;
  video50: number;
  video75: number;
  video95: number;
  video100: number;
  metaRevenueEst: number; // Σ(행별 광고비 × Meta ROAS) — 구매 전환값 없을 때 매출 역산용
  conversionComplete: boolean;
  hasData: boolean;
  hasVideoData: boolean; // 영상 재생 데이터 수집 여부 (0회 재생과 데이터 누락 구분)
  // 데이터 출처 추적 (임의 생성/역산 방지 근거)
  purchasesSource: PurchasesSource;
  purchaseValueSource: PurchaseValueSource;
  metaRoasSource: MetaRoasSource;
}

export interface DateRange {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD
}
