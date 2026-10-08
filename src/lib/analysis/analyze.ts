// 분석 조합 레이어 — 원본 데이터 + 지표 계산 + 판정 엔진을 묶어 UI 뷰모델을 만든다.
// 실제 연동 시에도 계산 로직(metrics/verdict)은 그대로 재사용된다.

import type {
  Ad,
  AggregatedInsight,
  AnalysisSettings,
  Contribution,
  CreativeType,
  DailyInsight,
  DateRange,
  MetricGroup,
  Verdict,
  VideoInsight,
} from "@/lib/types";
import {
  aggregate,
  computeContribution,
  computeMetricGroups,
  emptyAgg,
  findMetric,
} from "@/lib/metrics/calc";
import { evaluate } from "@/lib/verdict/engine";
import { daysBetween, previousRange, parseYMD } from "@/lib/metrics/periods";
import { ADS, AD_SETS, CAMPAIGNS } from "@/lib/mock/data";
import { genDailyInsights, genVideoInsights } from "@/lib/mock/insights";

export interface DailyPoint {
  date: string;
  dayIndex: number;
  metrics: Record<string, number | null>;
}

export interface AdAnalysis {
  ad: Ad;
  range: DateRange;
  prevRange: DateRange;
  cur: AggregatedInsight;
  prev: AggregatedInsight | null;
  hasPrevData: boolean;
  daysRunning: number;
  groups: MetricGroup[];
  verdict: Verdict;
  current: DailyPoint[];
  previous: DailyPoint[];
}

export interface EntityRollup {
  spend: number;
  purchases: number;
  purchaseValue: number;
  cpa: number | null;
  roas: number | null;
  ctr: number | null;
  verdictCode: Verdict["code"];
  hasData: boolean;
}

function sumAgg(a: AggregatedInsight, b: AggregatedInsight): AggregatedInsight {
  return {
    spend: a.spend + b.spend,
    impressions: a.impressions + b.impressions,
    reach: a.reach + b.reach,
    linkClicks: a.linkClicks + b.linkClicks,
    landingPageViews: a.landingPageViews + b.landingPageViews,
    purchases: a.purchases + b.purchases,
    purchaseValue: a.purchaseValue + b.purchaseValue,
    video3s: a.video3s + b.video3s,
    video25: a.video25 + b.video25,
    video50: a.video50 + b.video50,
    video75: a.video75 + b.video75,
    video95: a.video95 + b.video95,
    video100: a.video100 + b.video100,
    metaRevenueEst: a.metaRevenueEst + b.metaRevenueEst,
    conversionComplete: a.conversionComplete && b.conversionComplete,
    hasData: a.hasData || b.hasData,
    hasVideoData: a.hasVideoData || b.hasVideoData,
    purchasesSource: a.purchasesSource === "direct_purchase_column" || b.purchasesSource === "direct_purchase_column"
      ? "direct_purchase_column"
      : a.purchasesSource === "result_purchase_fallback" || b.purchasesSource === "result_purchase_fallback"
        ? "result_purchase_fallback"
        : "unavailable",
    purchaseValueSource: a.purchaseValueSource === "direct_purchase_value_column" || b.purchaseValueSource === "direct_purchase_value_column" ? "direct_purchase_value_column" : "unavailable",
    metaRoasSource: a.metaRoasSource === "direct_meta_roas_column" || b.metaRoasSource === "direct_meta_roas_column" ? "direct_meta_roas_column" : "unavailable",
  };
}

function daysRunningFor(ad: Ad, range: DateRange, now: Date): number {
  const created = parseYMD(range.end); // 상한
  const start = new Date(ad.createdTime);
  const daysSinceStart = Math.round((created.getTime() - startOfDay(start).getTime()) / 86_400_000) + 1;
  const rangeDays = daysBetween(range.start, range.end);
  return Math.max(0, Math.min(daysSinceStart, rangeDays));
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// 지표 그룹에서 단일 값 추출용 (단일 일자 포인트)
function pointMetrics(daily: DailyInsight, video: VideoInsight | null, ct: CreativeType): Record<string, number | null> {
  const agg = aggregate([daily], video ? [video] : []);
  const groups = computeMetricGroups(agg, null, ct, false);
  const keys = ["cpm", "frequency", "ctr", "cpc", "landingRate", "landingCost", "purchaseRate", "cpa", "aov", "roas", "hookRate", "holdRate", "completionRate"];
  const out: Record<string, number | null> = {};
  for (const k of keys) out[k] = findMetric(groups, k)?.current ?? null;
  return out;
}

export function analyzeAd(
  adId: string,
  range: DateRange,
  now: Date,
  settings: AnalysisSettings,
): AdAnalysis | null {
  const ad = ADS.find((a) => a.id === adId);
  if (!ad) return null;
  const prevRange = previousRange(range);

  const curDaily = genDailyInsights(adId, range, now);
  const curVideo = genVideoInsights(adId, range, now);
  const prevDaily = genDailyInsights(adId, prevRange, now);
  const prevVideo = genVideoInsights(adId, prevRange, now);

  const cur = aggregate(curDaily, curVideo);
  const prevAgg = aggregate(prevDaily, prevVideo);
  const hasPrevData = prevAgg.hasData;
  const prev = hasPrevData ? prevAgg : null;

  const groups = computeMetricGroups(cur, prev, ad.creativeType, hasPrevData);

  // 기여도(동일 광고세트 기준) — 판정 엔진 입력용
  const scopeContribution = contributionForAd(adId, "adset", range, now);

  const daysRunning = daysRunningFor(ad, range, now);
  const verdict = evaluate({
    cur,
    prev,
    hasPrevData,
    creativeType: ad.creativeType,
    daysRunning,
    groups,
    contributionSpendShare: scopeContribution.spendShare,
    contributionRevenue: scopeContribution.revenueContribution,
    settings,
  });

  // 일별 차트 포인트
  const current: DailyPoint[] = curDaily.map((d, i) => ({
    date: d.date,
    dayIndex: i,
    metrics: pointMetrics(d, curVideo.find((v) => v.date === d.date) ?? null, ad.creativeType),
  }));
  const previous: DailyPoint[] = prevDaily.map((d, i) => ({
    date: d.date,
    dayIndex: i,
    metrics: pointMetrics(d, prevVideo.find((v) => v.date === d.date) ?? null, ad.creativeType),
  }));

  return { ad, range, prevRange, cur, prev, hasPrevData, daysRunning, groups, verdict, current, previous };
}

// 특정 광고의 비교 범위 내 기여도
export function contributionForAd(
  adId: string,
  scope: Contribution["scope"],
  range: DateRange,
  now: Date,
): Contribution {
  const ad = ADS.find((a) => a.id === adId);
  if (!ad) return computeContribution(emptyAgg(), emptyAgg(), scope);

  const scopeAdIds = adIdsInScope(adId, scope);
  const adAgg = aggAdRange(adId, range, now);
  let total = emptyAgg();
  for (const id of scopeAdIds) total = sumAgg(total, aggAdRange(id, range, now));
  return computeContribution(adAgg, total, scope);
}

function aggAdRange(adId: string, range: DateRange, now: Date): AggregatedInsight {
  return aggregate(genDailyInsights(adId, range, now), genVideoInsights(adId, range, now));
}

function adIdsInScope(adId: string, scope: Contribution["scope"]): string[] {
  const ad = ADS.find((a) => a.id === adId);
  if (!ad) return [];
  if (scope === "adset") return ADS.filter((a) => a.adSetId === ad.adSetId).map((a) => a.id);
  const set = AD_SETS.find((s) => s.id === ad.adSetId);
  if (!set) return [adId];
  if (scope === "campaign") {
    const setIds = AD_SETS.filter((s) => s.campaignId === set.campaignId).map((s) => s.id);
    return ADS.filter((a) => setIds.includes(a.adSetId)).map((a) => a.id);
  }
  // account
  const campaign = CAMPAIGNS.find((c) => c.id === set.campaignId);
  if (!campaign) return [adId];
  const campIds = CAMPAIGNS.filter((c) => c.adAccountId === campaign.adAccountId).map((c) => c.id);
  const setIds = AD_SETS.filter((s) => campIds.includes(s.campaignId)).map((s) => s.id);
  return ADS.filter((a) => setIds.includes(a.adSetId)).map((a) => a.id);
}

// 엔티티(광고/세트/캠페인) 롤업 — 목록 배지/지표용
export function rollupForAds(
  adIds: string[],
  range: DateRange,
  now: Date,
  settings: AnalysisSettings,
): EntityRollup {
  let cur = emptyAgg();
  let prev = emptyAgg();
  const prevRange = previousRange(range);
  let maxDaysRunning = 0;
  let creativeType: CreativeType = "other";
  const singleAd = adIds.length === 1 ? ADS.find((a) => a.id === adIds[0]) : undefined;
  if (singleAd) creativeType = singleAd.creativeType;

  for (const id of adIds) {
    cur = sumAgg(cur, aggAdRange(id, range, now));
    prev = sumAgg(prev, aggAdRange(id, prevRange, now));
    const ad = ADS.find((a) => a.id === id);
    if (ad) maxDaysRunning = Math.max(maxDaysRunning, daysRunningFor(ad, range, now));
  }

  const hasPrevData = prev.hasData;
  const groups = computeMetricGroups(cur, hasPrevData ? prev : null, creativeType, hasPrevData);
  const contribution = singleAd
    ? contributionForAd(singleAd.id, "adset", range, now)
    : { spendShare: null, revenueContribution: null };

  const verdict: Verdict = cur.hasData
    ? evaluate({
        cur,
        prev: hasPrevData ? prev : null,
        hasPrevData,
        creativeType,
        daysRunning: maxDaysRunning,
        groups,
        contributionSpendShare: contribution.spendShare,
        contributionRevenue: contribution.revenueContribution,
        settings,
      })
    : {
        code: "data_insufficient",
        confidence: "낮음",
        dataSufficiency: "부족",
        reasons: ["집계 기간에 수집된 데이터가 없습니다."],
        action: "데이터 수집 후 재평가가 필요합니다.",
      };

  const cpa = cur.purchases > 0 ? cur.spend / cur.purchases : null;
  const roas = cur.spend > 0 && cur.purchaseValue > 0 ? (cur.purchaseValue / cur.spend) * 100 : null;
  const ctr = cur.impressions > 0 ? (cur.linkClicks / cur.impressions) * 100 : null;

  return {
    spend: cur.spend,
    purchases: cur.purchases,
    purchaseValue: cur.purchaseValue,
    cpa,
    roas,
    ctr,
    verdictCode: verdict.code,
    hasData: cur.hasData,
  };
}

// 편의: 광고 하나 롤업
export function rollupForAd(adId: string, range: DateRange, now: Date, settings: AnalysisSettings): EntityRollup {
  return rollupForAds([adId], range, now, settings);
}

// ── 전체 광고계정 요약 ────────────────────────────────────────
export interface AdOverview {
  adId: string;
  name: string;
  creativeType: CreativeType;
  spend: number;
  roas: number | null;
  cpa: number | null;
  verdictCode: Verdict["code"];
  revenueVsSpend: number | null; // 매출 기여도 - 광고비 비중 (계정 범위)
  purchaseVsSpend: number | null;
  roasChangePct: number | null; // 이전 대비 ROAS 증감
  hasMinData: boolean;
}

export interface AccountOverview {
  cur: AggregatedInsight;
  prev: AggregatedInsight | null;
  hasPrevData: boolean;
  ads: AdOverview[];
}

function adIdsInAccount(adAccountId: string): string[] {
  const campIds = CAMPAIGNS.filter((c) => c.adAccountId === adAccountId).map((c) => c.id);
  const setIds = AD_SETS.filter((s) => campIds.includes(s.campaignId)).map((s) => s.id);
  return ADS.filter((a) => setIds.includes(a.adSetId)).map((a) => a.id);
}

export function accountOverview(
  adAccountId: string,
  range: DateRange,
  now: Date,
  settings: AnalysisSettings,
): AccountOverview {
  const prevRange = previousRange(range);
  const adIds = adIdsInAccount(adAccountId);

  let curTotal = emptyAgg();
  let prevTotal = emptyAgg();
  for (const id of adIds) {
    curTotal = sumAgg(curTotal, aggAdRange(id, range, now));
    prevTotal = sumAgg(prevTotal, aggAdRange(id, prevRange, now));
  }
  const hasPrevData = prevTotal.hasData;

  const ads: AdOverview[] = adIds.map((id) => {
    const ad = ADS.find((a) => a.id === id)!;
    const cur = aggAdRange(id, range, now);
    const prev = aggAdRange(id, prevRange, now);
    const rollup = rollupForAds([id], range, now, settings);
    const spendShare = curTotal.spend > 0 ? (cur.spend / curTotal.spend) * 100 : null;
    const revShare = curTotal.purchaseValue > 0 ? (cur.purchaseValue / curTotal.purchaseValue) * 100 : null;
    const purShare = curTotal.purchases > 0 ? (cur.purchases / curTotal.purchases) * 100 : null;
    const curRoas = cur.spend > 0 && cur.purchaseValue > 0 ? (cur.purchaseValue / cur.spend) * 100 : null;
    const prevRoas = prev.spend > 0 && prev.purchaseValue > 0 ? (prev.purchaseValue / prev.spend) * 100 : null;
    const roasChangePct =
      prev.hasData && prevRoas !== null && prevRoas > 0 && curRoas !== null
        ? ((curRoas - prevRoas) / prevRoas) * 100
        : null;

    return {
      adId: id,
      name: ad.name,
      creativeType: ad.creativeType,
      spend: cur.spend,
      roas: rollup.roas,
      cpa: rollup.cpa,
      verdictCode: rollup.verdictCode,
      revenueVsSpend: revShare !== null && spendShare !== null ? revShare - spendShare : null,
      purchaseVsSpend: purShare !== null && spendShare !== null ? purShare - spendShare : null,
      roasChangePct,
      hasMinData: cur.spend >= settings.minSpend && cur.impressions >= settings.minImpressions,
    };
  });

  return { cur: curTotal, prev: hasPrevData ? prevTotal : null, hasPrevData, ads };
}
