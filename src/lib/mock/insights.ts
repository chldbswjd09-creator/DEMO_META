// 샘플 일별 성과 생성기 — 결정론적(같은 광고+날짜 → 같은 값). 랜덤 미사용.

import type { DailyInsight, VideoInsight } from "@/lib/types";
import { eachDate, parseYMD } from "@/lib/metrics/periods";
import type { AdProfile } from "@/lib/mock/data";
import { AD_PROFILES } from "@/lib/mock/data";
import type { DateRange } from "@/lib/types";

// 문자열 → 32bit 해시 → [0,1) 유사난수 (결정론적)
function seededNoise(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  return h / 4294967295;
}

// 0.92 ~ 1.08 범위 노이즈
function noiseFactor(adId: string, date: string, salt: string): number {
  return 0.92 + seededNoise(`${adId}|${date}|${salt}`) * 0.16;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 광고 집행 시작일(YMD)
function startDate(profile: AdProfile, now: Date): string {
  const d = new Date(now);
  d.setDate(d.getDate() - profile.startedDaysAgo);
  return ymd(d);
}

// 날짜가 '어제'로부터 며칠 전인지 (0 = 어제, 최근일수록 작음)
// now의 시각(시/분) 영향을 받지 않도록 날짜(자정) 기준으로만 계산한다.
function ageFromYesterday(date: string, now: Date): number {
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  yesterday.setDate(yesterday.getDate() - 1);
  return Math.round((yesterday.getTime() - parseYMD(date).getTime()) / 86_400_000);
}

interface DayGen {
  daily: DailyInsight | null;
  video: VideoInsight | null;
}

function genDay(adId: string, profile: AdProfile, date: string, now: Date): DayGen {
  // 집행 시작 이전 → 데이터 없음
  if (parseYMD(date).getTime() < parseYMD(startDate(profile, now)).getTime()) {
    return { daily: null, video: null };
  }

  const age = ageFromYesterday(date, now); // 0=어제
  // 소재 피로도용 최근 가중치 (최근 14일에서 최근일수록 1)
  const recency = Math.max(0, Math.min(1, (14 - age) / 14));

  let ctr = profile.ctr;
  let frequency = profile.frequency;
  let purchaseRate = profile.purchaseRate;
  let hookRate = profile.hookRate;
  let conversionComplete = true;

  if (profile.archetype === "fatigue") {
    ctr = profile.ctr * (1 - 0.45 * recency);
    frequency = profile.frequency * (1 + 0.9 * recency);
    purchaseRate = profile.purchaseRate * (1 - 0.45 * recency);
    if (hookRate) hookRate = hookRate * (1 - 0.35 * recency);
  }

  if (profile.archetype === "tracking") {
    // 최근 기간(현재 조회 대상, age<7) 구매 0 + 일부 전환 데이터 누락
    if (age < 7) {
      purchaseRate = 0;
      if (age % 3 === 0) conversionComplete = false;
    }
  }

  const spend = Math.round(profile.dailySpend * noiseFactor(adId, date, "spend"));
  const impressions = Math.max(1, Math.round((spend / profile.cpm) * 1000 * noiseFactor(adId, date, "imp")));
  const reach = Math.max(1, Math.round(impressions / frequency));
  const linkClicks = Math.round(impressions * ctr * noiseFactor(adId, date, "ctr"));
  const landingPageViews = Math.round(linkClicks * profile.landingRate * noiseFactor(adId, date, "lpv"));
  const purchases = Math.round(landingPageViews * purchaseRate * noiseFactor(adId, date, "pur"));
  const purchaseValue = Math.round(purchases * profile.aov * noiseFactor(adId, date, "aov"));

  const daily: DailyInsight = {
    date,
    adId,
    spend,
    impressions,
    reach,
    linkClicks,
    landingPageViews,
    purchases,
    purchaseValue,
    currency: "KRW",
    conversionComplete,
  };

  let video: VideoInsight | null = null;
  if (profile.hookRate) {
    const v3 = Math.round(impressions * (hookRate ?? profile.hookRate) * noiseFactor(adId, date, "v3"));
    const v50 = Math.round(v3 * (profile.holdRate ?? 0.5));
    const v100 = Math.round(v3 * (profile.completionRate ?? 0.2));
    video = { date, adId, video3s: v3, video50: v50, video100: v100, videoComplete: true };
  }

  return { daily, video };
}

export function genDailyInsights(adId: string, range: DateRange, now: Date): DailyInsight[] {
  const profile = AD_PROFILES[adId];
  if (!profile) return [];
  const out: DailyInsight[] = [];
  for (const date of eachDate(range)) {
    const { daily } = genDay(adId, profile, date, now);
    if (daily) out.push(daily);
  }
  return out;
}

export function genVideoInsights(adId: string, range: DateRange, now: Date): VideoInsight[] {
  const profile = AD_PROFILES[adId];
  if (!profile) return [];
  const out: VideoInsight[] = [];
  for (const date of eachDate(range)) {
    const { video } = genDay(adId, profile, date, now);
    if (video) out.push(video);
  }
  return out;
}
