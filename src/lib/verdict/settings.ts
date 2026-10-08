// 광고계정 기본 분석 기준값 (코드 고정 금지 — 실제 구현에서는 analysis_settings 테이블/설정화면에서 로드)

import type { AnalysisSettings } from "@/lib/types";

export const DEFAULT_SETTINGS: AnalysisSettings = {
  targetCpa: 15000,
  targetRoas: 300, // %
  baseCtr: 1.0, // %
  baseCpc: 800,
  baseLandingRate: 70, // %
  baseLandingCost: 500,
  basePurchaseRate: 2.0, // %
  baseHookRate: 25, // %
  baseHoldRate: 45, // %
  baseCompletionRate: 15, // %
  minSpend: 30000,
  minImpressions: 3000,
  minLinkClicks: 50,
  minLandingViews: 30,
  minPurchases: 1,
  baseObservationDays: 3,
  extraObservationDays: 2,
  fatigueFrequency: 2.5,
  attributionWindow: "7d_click_1d_view",
  significantChangePct: 5,
  pauseRoasRatio: 0.5,
  strongContributionGapPct: 5,
};
