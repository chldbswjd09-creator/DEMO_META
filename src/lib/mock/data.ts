// 샘플(가짜) 자산 데이터 — 실제 API 연동 시 이 모듈만 교체한다.

import type {
  Ad,
  AdAccount,
  AdSet,
  BusinessPortfolio,
  Campaign,
  CreativeType,
} from "@/lib/types";

export type Archetype =
  | "excellent"
  | "good"
  | "fatigue"
  | "pause"
  | "insufficient"
  | "tracking"
  | "no_previous"
  | "normal";

export interface AdProfile {
  archetype: Archetype;
  startedDaysAgo: number; // 집행 시작(오늘로부터 N일 전)
  dailySpend: number;
  cpm: number; // 원 / 1000 노출
  ctr: number; // 링크클릭률 (fraction)
  landingRate: number; // fraction
  purchaseRate: number; // fraction
  aov: number; // 객단가(원)
  frequency: number;
  hookRate?: number; // fraction (영상)
  holdRate?: number;
  completionRate?: number;
}

// ── 비즈니스 포트폴리오 2개 ──────────────────────────────────
export const PORTFOLIOS: BusinessPortfolio[] = [
  { id: "pf_1", name: "쥬스박스 커머스", accessType: "owner" },
  { id: "pf_2", name: "파트너 브랜드 그룹", accessType: "shared" },
];

// ── 광고계정 4개 이상 ────────────────────────────────────────
export const AD_ACCOUNTS: AdAccount[] = [
  {
    id: "act_1001",
    portfolioId: "pf_1",
    name: "쥬스박스 광고계정 4",
    currency: "KRW",
    timezone: "Asia/Seoul",
    status: "active",
    accessType: "owner",
    lastSyncedAt: hoursAgoISO(3),
  },
  {
    id: "act_1002",
    portfolioId: "pf_1",
    name: "쥬스박스 광고계정 5",
    currency: "KRW",
    timezone: "Asia/Seoul",
    status: "active",
    accessType: "owner",
    lastSyncedAt: hoursAgoISO(5),
  },
  {
    id: "act_1003",
    portfolioId: "pf_1",
    name: "쥬스박스 테스트 계정 (비활성)",
    currency: "KRW",
    timezone: "Asia/Seoul",
    status: "inactive",
    accessType: "owner",
    lastSyncedAt: hoursAgoISO(72),
  },
  {
    id: "act_2001",
    portfolioId: "pf_2",
    name: "파트너 A 광고계정",
    currency: "KRW",
    timezone: "Asia/Seoul",
    status: "active",
    accessType: "shared",
    lastSyncedAt: hoursAgoISO(8),
  },
  {
    id: "act_2002",
    portfolioId: "pf_2",
    name: "파트너 B 광고계정 — 매우 긴 이름 말줄임 처리 확인용 계정 이름 예시입니다",
    currency: "KRW",
    timezone: "Asia/Seoul",
    status: "active",
    accessType: "shared",
    lastSyncedAt: hoursAgoISO(30),
  },
];

// ── 캠페인 ───────────────────────────────────────────────────
export const CAMPAIGNS: Campaign[] = [
  { id: "camp_1", adAccountId: "act_1001", name: "여름 신제품 런칭 캠페인", status: "active", objective: "구매 전환" },
  { id: "camp_2", adAccountId: "act_1001", name: "브랜드 인지도 캠페인", status: "active", objective: "인지도" },
  {
    id: "camp_3",
    adAccountId: "act_1001",
    name: "리타겟팅 캠페인 — 장바구니 이탈 대상 성과 점검용 긴 캠페인 이름 예시",
    status: "active",
    objective: "구매 전환",
  },
  { id: "camp_4", adAccountId: "act_1002", name: "겨울 시즌 프로모션", status: "active", objective: "구매 전환" },
  { id: "camp_5", adAccountId: "act_2001", name: "파트너 A 런칭 캠페인", status: "active", objective: "트래픽" },
];

// ── 광고세트 ─────────────────────────────────────────────────
export const AD_SETS: AdSet[] = [
  { id: "set_1a", campaignId: "camp_1", name: "핵심 타겟 20-30 여성", status: "active" },
  { id: "set_1b", campaignId: "camp_1", name: "관심사 확장 타겟", status: "active" },
  { id: "set_1c", campaignId: "camp_1", name: "유사타겟 1%", status: "active" },
  { id: "set_2a", campaignId: "camp_2", name: "광범위 타겟", status: "active" },
  { id: "set_3a", campaignId: "camp_3", name: "장바구니 이탈 리타겟", status: "active" },
  { id: "set_4a", campaignId: "camp_4", name: "겨울 핵심 타겟", status: "active" },
  { id: "set_5a", campaignId: "camp_5", name: "파트너 A 기본 타겟", status: "active" },
];

interface AdSeed {
  id: string;
  adSetId: string;
  name: string;
  status: "active" | "inactive";
  creativeType: CreativeType;
  profile: AdProfile;
}

// ── 광고 (set_1a에 7개 → 5개 초과 케이스 + 전 아키타입 포함) ──
const AD_SEEDS: AdSeed[] = [
  {
    id: "ad_1",
    adSetId: "set_1a",
    name: "여름 신제품 A 영상 소재 (핵심 후킹형)",
    status: "active",
    creativeType: "video",
    profile: {
      archetype: "excellent",
      startedDaysAgo: 21,
      dailySpend: 180000,
      cpm: 7000,
      ctr: 0.021,
      landingRate: 0.82,
      purchaseRate: 0.035,
      aov: 46000,
      frequency: 1.7,
      hookRate: 0.34,
      holdRate: 0.56,
      completionRate: 0.28,
    },
  },
  {
    id: "ad_2",
    adSetId: "set_1a",
    name: "여름 신제품 B 이미지 소재",
    status: "active",
    creativeType: "image",
    profile: {
      archetype: "good",
      startedDaysAgo: 21,
      dailySpend: 120000,
      cpm: 6200,
      ctr: 0.016,
      landingRate: 0.78,
      purchaseRate: 0.026,
      aov: 42000,
      frequency: 1.9,
    },
  },
  {
    id: "ad_3",
    adSetId: "set_1a",
    name: "여름 신제품 C 영상 소재 (초기 성과형)",
    status: "active",
    creativeType: "video",
    profile: {
      archetype: "fatigue",
      startedDaysAgo: 24,
      dailySpend: 150000,
      cpm: 6800,
      ctr: 0.02,
      landingRate: 0.76,
      purchaseRate: 0.028,
      aov: 40000,
      frequency: 2.7,
      hookRate: 0.3,
      holdRate: 0.48,
      completionRate: 0.2,
    },
  },
  {
    id: "ad_4",
    adSetId: "set_1a",
    name: "여름 신제품 D 이미지 소재",
    status: "active",
    creativeType: "image",
    profile: {
      archetype: "pause",
      startedDaysAgo: 18,
      dailySpend: 95000,
      cpm: 8200,
      ctr: 0.008,
      landingRate: 0.55,
      purchaseRate: 0.008,
      aov: 33000,
      frequency: 2.1,
    },
  },
  {
    id: "ad_5",
    adSetId: "set_1a",
    name: "여름 신제품 E 신규 영상 소재",
    status: "active",
    creativeType: "video",
    profile: {
      archetype: "insufficient",
      startedDaysAgo: 2,
      dailySpend: 9000,
      cpm: 7500,
      ctr: 0.018,
      landingRate: 0.75,
      purchaseRate: 0.02,
      aov: 41000,
      frequency: 1.2,
      hookRate: 0.29,
      holdRate: 0.5,
      completionRate: 0.22,
    },
  },
  {
    id: "ad_6",
    adSetId: "set_1a",
    name: "여름 신제품 F 캐러셀 소재",
    status: "active",
    creativeType: "carousel",
    profile: {
      archetype: "tracking",
      startedDaysAgo: 20,
      dailySpend: 110000,
      cpm: 6500,
      ctr: 0.017,
      landingRate: 0.79,
      purchaseRate: 0.024,
      aov: 44000,
      frequency: 1.8,
    },
  },
  {
    id: "ad_7",
    adSetId: "set_1a",
    name: "여름 신제품 G 신규 이미지 — 이름이 매우 길어 말줄임과 툴팁을 확인하기 위한 예시 광고명입니다",
    status: "active",
    creativeType: "image",
    profile: {
      archetype: "no_previous",
      startedDaysAgo: 5,
      dailySpend: 88000,
      cpm: 6400,
      ctr: 0.019,
      landingRate: 0.8,
      purchaseRate: 0.03,
      aov: 45000,
      frequency: 1.4,
    },
  },
  // 다른 광고세트들 — 탐색 다양성용
  {
    id: "ad_8",
    adSetId: "set_1b",
    name: "관심사 확장 A 이미지",
    status: "active",
    creativeType: "image",
    profile: { archetype: "normal", startedDaysAgo: 15, dailySpend: 70000, cpm: 6600, ctr: 0.013, landingRate: 0.72, purchaseRate: 0.018, aov: 39000, frequency: 1.6 },
  },
  {
    id: "ad_9",
    adSetId: "set_1b",
    name: "관심사 확장 B 영상",
    status: "active",
    creativeType: "video",
    profile: { archetype: "good", startedDaysAgo: 15, dailySpend: 90000, cpm: 7100, ctr: 0.018, landingRate: 0.77, purchaseRate: 0.027, aov: 43000, frequency: 1.7, hookRate: 0.31, holdRate: 0.52, completionRate: 0.24 },
  },
  {
    id: "ad_10",
    adSetId: "set_1c",
    name: "유사타겟 A 이미지",
    status: "active",
    creativeType: "image",
    profile: { archetype: "normal", startedDaysAgo: 12, dailySpend: 60000, cpm: 6900, ctr: 0.012, landingRate: 0.7, purchaseRate: 0.016, aov: 38000, frequency: 1.5 },
  },
  {
    id: "ad_11",
    adSetId: "set_2a",
    name: "브랜드 인지 영상 A",
    status: "active",
    creativeType: "video",
    profile: { archetype: "normal", startedDaysAgo: 20, dailySpend: 130000, cpm: 4200, ctr: 0.009, landingRate: 0.6, purchaseRate: 0.006, aov: 36000, frequency: 2.4, hookRate: 0.27, holdRate: 0.44, completionRate: 0.18 },
  },
  {
    id: "ad_12",
    adSetId: "set_3a",
    name: "리타겟 장바구니 이미지",
    status: "active",
    creativeType: "image",
    profile: { archetype: "excellent", startedDaysAgo: 16, dailySpend: 75000, cpm: 5800, ctr: 0.028, landingRate: 0.85, purchaseRate: 0.05, aov: 48000, frequency: 2.0 },
  },
  {
    id: "ad_13",
    adSetId: "set_4a",
    name: "겨울 프로모션 영상 A",
    status: "active",
    creativeType: "video",
    profile: { archetype: "good", startedDaysAgo: 10, dailySpend: 100000, cpm: 6700, ctr: 0.017, landingRate: 0.76, purchaseRate: 0.025, aov: 41000, frequency: 1.6, hookRate: 0.3, holdRate: 0.5, completionRate: 0.23 },
  },
  {
    id: "ad_14",
    adSetId: "set_5a",
    name: "파트너 A 기본 이미지",
    status: "active",
    creativeType: "image",
    profile: { archetype: "normal", startedDaysAgo: 14, dailySpend: 55000, cpm: 7000, ctr: 0.011, landingRate: 0.68, purchaseRate: 0.015, aov: 37000, frequency: 1.5 },
  },
];

export const ADS: Ad[] = AD_SEEDS.map((s) => ({
  id: s.id,
  adSetId: s.adSetId,
  name: s.name,
  status: s.status,
  creativeType: s.creativeType,
  createdTime: daysAgoISO(s.profile.startedDaysAgo),
  thumbnailUrl: undefined, // 미리보기 없음 케이스 (플레이스홀더 표시)
}));

export const AD_PROFILES: Record<string, AdProfile> = Object.fromEntries(
  AD_SEEDS.map((s) => [s.id, s.profile]),
);

// ── 사용자별 접근 권한 (Mock) ────────────────────────────────
// user_ad_account_access 를 흉내낸다.
export const USER_ACCESS: Record<
  string,
  { portfolioIds: string[]; adAccountIds: string[] }
> = {
  "user-a@company.com": {
    portfolioIds: ["pf_1", "pf_2"],
    adAccountIds: ["act_1001", "act_1002", "act_1003", "act_2001", "act_2002"],
  },
  "user-b@company.com": {
    // 다른 사용자는 파트너 포트폴리오만 접근 (계정 변경 격리 확인용)
    portfolioIds: ["pf_2"],
    adAccountIds: ["act_2001", "act_2002"],
  },
};

// ── 날짜 헬퍼 (모듈 로드시 1회, 클라이언트에서만 사용) ────────
function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}
function hoursAgoISO(hours: number): string {
  const d = new Date();
  d.setHours(d.getHours() - hours);
  return d.toISOString();
}
