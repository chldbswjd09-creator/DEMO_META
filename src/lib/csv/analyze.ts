// CSV 데이터셋 → 대시보드 뷰모델. 기존 지표 계산(calc)과 판정 엔진(engine)을 그대로 재사용한다.

import type {
  Ad,
  AdSet,
  AggregatedInsight,
  AnalysisSettings,
  Campaign,
  Contribution,
  CreativeType,
  DateRange,
  MetricGroup,
} from "@/lib/types";
import { computeContribution, computeMetricGroups, emptyAgg, findMetric } from "@/lib/metrics/calc";
import { evaluate } from "@/lib/verdict/engine";
import type { Verdict } from "@/lib/types";
import type { AdAnalysis, AccountOverview, AdOverview, EntityRollup } from "@/lib/analysis/analyze";
import type { AdRow, AdSetRow, CampaignRow } from "@/lib/services/api";
import type { PerfField } from "@/lib/csv/columnMap";
import type { AdRecord, Dataset } from "@/lib/csv/dataset";
import { mergePurchasesSource } from "@/lib/csv/purchaseFallback";

export interface CsvAdAnalysis extends AdAnalysis {
  record: AdRecord;
  missingDiagnoses: string[];
  creativeTypeAuto: boolean;
  isNew: boolean; // 현재 기간에만 존재(신규 광고)
}

export const METRIC_SOURCES: Record<string, PerfField[]> = {
  cpm: ["spend", "impressions"],
  frequency: ["impressions", "reach"],
  ctr: ["linkClicks", "impressions"],
  cpc: ["spend", "linkClicks"],
  landingRate: ["landingPageViews", "linkClicks"],
  landingCost: ["spend", "landingPageViews"],
  purchaseRate: ["purchases", "landingPageViews"],
  cpa: ["spend", "purchases"],
  aov: ["purchaseValue", "purchases"],
  roas: ["purchaseValue", "spend"],
  hookRate: ["video3s", "impressions"],
  holdRate: ["video50", "video3s"],
  completionRate: ["video100", "video3s"],
};

export function sumAgg(a: AggregatedInsight, b: AggregatedInsight): AggregatedInsight {
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
    purchasesSource: mergePurchasesSource(a.purchasesSource, b.purchasesSource),
    purchaseValueSource: a.purchaseValueSource === "direct_purchase_value_column" || b.purchaseValueSource === "direct_purchase_value_column" ? "direct_purchase_value_column" : "unavailable",
    metaRoasSource: a.metaRoasSource === "direct_meta_roas_column" || b.metaRoasSource === "direct_meta_roas_column" ? "direct_meta_roas_column" : "unavailable",
  };
}

// 없는 원본 열 때문에 최소 기준이 오작동하지 않도록 설정을 보정
export function adjustSettings(settings: AnalysisSettings, present: Set<PerfField>): AnalysisSettings {
  return {
    ...settings,
    minLinkClicks: present.has("linkClicks") ? settings.minLinkClicks : 0,
    minLandingViews: present.has("landingPageViews") ? settings.minLandingViews : 0,
    minPurchases: present.has("purchases") ? settings.minPurchases : 0,
  };
}

// 혼합 CSV 안전장치: 파일 전체에 purchase 결과가 하나라도 있어 present 에 purchases 가 포함돼도,
// 이 집계(광고/롤업)에 구매 근거가 없으면(purchasesSource==="unavailable") purchases 를 제외한다.
// → link_click 전용 광고는 '구매 0'이 아니라 '원본 열 없음'으로 표기된다.
export function effectivePresent(agg: AggregatedInsight, present: PerfField[]): PerfField[] {
  if (present.includes("purchases") && agg.purchasesSource === "unavailable") {
    return present.filter((f) => f !== "purchases");
  }
  return present;
}

// 원본 열이 없는 지표는 '원본 열 없음' 상태로 표기
export function applyMissingColumns(groups: MetricGroup[], present: Set<PerfField>): void {
  for (const g of groups) {
    for (const m of g.metrics) {
      const src = METRIC_SOURCES[m.key];
      if (src && !src.every((f) => present.has(f))) {
        m.state = "missing_column";
        m.current = null;
        m.previous = null;
        m.changePct = null;
        m.changeNote = "normal";
      }
    }
  }
}

function presentSet(dataset: Dataset): Set<PerfField> {
  return new Set(dataset.presentPerfFields);
}

function rangeOf(dataset: Dataset): { range: DateRange; prevRange: DateRange } {
  const c = dataset.period.current ?? {};
  const p = dataset.period.previous ?? {};
  return {
    range: { start: c.start ?? "", end: c.end ?? "" },
    prevRange: { start: p.start ?? "", end: p.end ?? "" },
  };
}

function rollupForKeys(
  dataset: Dataset,
  keys: string[],
  settings: AnalysisSettings,
  creativeType: CreativeType = "other",
): EntityRollup {
  const present = presentSet(dataset);
  let cur = emptyAgg();
  let prev = emptyAgg();
  for (const k of keys) {
    const rec = dataset.recordsByKey.get(k);
    if (!rec) continue;
    if (rec.cur) cur = sumAgg(cur, rec.cur);
    if (rec.prev) prev = sumAgg(prev, rec.prev);
  }
  const hasPrevData = prev.hasData;
  const eff = new Set(effectivePresent(cur, [...present]));
  const groups = computeMetricGroups(cur, hasPrevData ? prev : null, creativeType, hasPrevData);
  applyMissingColumns(groups, eff);
  const s = adjustSettings(settings, eff);

  const verdict: Verdict = cur.hasData
    ? evaluate({
        cur,
        prev: hasPrevData ? prev : null,
        hasPrevData,
        creativeType,
        daysRunning: 9999, // CSV는 집계본 → 관찰 기간 개념 미적용
        groups,
        contributionSpendShare: null,
        contributionRevenue: null,
        settings: s,
      })
    : {
        code: "data_insufficient",
        confidence: "낮음",
        dataSufficiency: "부족",
        reasons: ["집계된 데이터가 없습니다."],
        action: "데이터 확인이 필요합니다.",
      };

  const cpa = cur.purchases > 0 ? cur.spend / cur.purchases : null;
  const roas = cur.spend > 0 && cur.purchaseValue > 0 ? (cur.purchaseValue / cur.spend) * 100 : null;
  const ctr = present.has("linkClicks") && cur.impressions > 0 ? (cur.linkClicks / cur.impressions) * 100 : null;

  return {
    spend: cur.spend,
    purchases: cur.purchases,
    purchaseValue: cur.purchaseValue,
    cpa: eff.has("purchases") ? cpa : null,
    roas: eff.has("purchaseValue") ? roas : null,
    ctr,
    verdictCode: verdict.code,
    hasData: cur.hasData,
  };
}

function statusOf(rec: AdRecord): "active" | "inactive" {
  const s = (rec.adStatus ?? "").toLowerCase();
  if (/(active|활성|게재중|running|on)/.test(s)) return "active";
  if (/(inactive|비활성|off|paused|중지|종료)/.test(s)) return "inactive";
  return "active";
}

function toAd(rec: AdRecord): Ad {
  return {
    id: rec.key,
    adSetId: rec.adSetKey,
    name: rec.adName,
    status: statusOf(rec),
    creativeType: rec.creativeType,
    thumbnailUrl: undefined,
    createdTime: "",
  };
}

// 계층 목록 ────────────────────────────────────────────────────
function currentAdKeys(dataset: Dataset, adSetKey: string): string[] {
  const node = dataset.adSets.get(adSetKey);
  if (!node) return [];
  return node.adKeys.filter((k) => dataset.recordsByKey.get(k)?.cur);
}

export function listCampaignRows(dataset: Dataset, accountKey: string, settings: AnalysisSettings): CampaignRow[] {
  const acc = dataset.accounts.find((a) => a.key === accountKey);
  if (!acc) return [];
  return acc.campaignKeys.map((ck) => {
    const camp = dataset.campaigns.get(ck)!;
    const adKeys: string[] = [];
    for (const sk of camp.adSetKeys) adKeys.push(...currentAdKeys(dataset, sk));
    const campaign: Campaign = { id: camp.key, adAccountId: accountKey, name: camp.name, status: "active", objective: "" };
    return {
      ...campaign,
      adSetCount: camp.adSetKeys.length,
      adCount: adKeys.length,
      rollup: rollupForKeys(dataset, adKeys, settings),
    };
  });
}

export function listAdSetRows(dataset: Dataset, campaignKey: string, settings: AnalysisSettings): AdSetRow[] {
  const camp = dataset.campaigns.get(campaignKey);
  if (!camp) return [];
  return camp.adSetKeys.map((sk) => {
    const node = dataset.adSets.get(sk)!;
    const adKeys = currentAdKeys(dataset, sk);
    const adSet: AdSet = { id: node.key, campaignId: campaignKey, name: node.name, status: "active" };
    return { ...adSet, adCount: adKeys.length, rollup: rollupForKeys(dataset, adKeys, settings) };
  });
}

export function listAdRows(
  dataset: Dataset,
  adSetKey: string,
  settings: AnalysisSettings,
  includePreviousOnly = false,
): AdRow[] {
  const node = dataset.adSets.get(adSetKey);
  if (!node) return [];
  return node.adKeys
    .map((k) => dataset.recordsByKey.get(k)!)
    .filter((rec) => includePreviousOnly || rec.match !== "previous_only")
    .map((rec) => ({ ...toAd(rec), rollup: rollupForKeys(dataset, [rec.key], settings, rec.creativeType) }));
}

// 기여도 ────────────────────────────────────────────────────────
function scopeKeys(dataset: Dataset, rec: AdRecord, scope: Contribution["scope"]): string[] {
  if (scope === "adset") return currentAdKeys(dataset, rec.adSetKey);
  if (scope === "campaign") {
    const camp = dataset.campaigns.get(rec.campaignKey);
    if (!camp) return [rec.key];
    return camp.adSetKeys.flatMap((sk) => currentAdKeys(dataset, sk));
  }
  // account
  const acc = dataset.accounts.find((a) => a.key === rec.accountKey);
  if (!acc) return [rec.key];
  return acc.campaignKeys
    .map((ck) => dataset.campaigns.get(ck)!)
    .flatMap((c) => c.adSetKeys.flatMap((sk) => currentAdKeys(dataset, sk)));
}

function contributionFor(dataset: Dataset, rec: AdRecord, scope: Contribution["scope"]): Contribution {
  const adAgg = rec.cur ?? emptyAgg();
  let total = emptyAgg();
  for (const k of scopeKeys(dataset, rec, scope)) {
    const r = dataset.recordsByKey.get(k);
    if (r?.cur) total = sumAgg(total, r.cur);
  }
  return computeContribution(adAgg, total, scope);
}

export function contributionsForAd(dataset: Dataset, adKey: string): Record<Contribution["scope"], Contribution> {
  const rec = dataset.recordsByKey.get(adKey)!;
  return {
    adset: contributionFor(dataset, rec, "adset"),
    campaign: contributionFor(dataset, rec, "campaign"),
    account: contributionFor(dataset, rec, "account"),
  };
}

// 광고 상세 분석 ────────────────────────────────────────────────
export function analyzeAdCsv(dataset: Dataset, adKey: string, settings: AnalysisSettings): CsvAdAnalysis | null {
  const rec = dataset.recordsByKey.get(adKey);
  if (!rec) return null;
  const present = presentSet(dataset);
  const { range, prevRange } = rangeOf(dataset);

  const cur = rec.cur ?? emptyAgg();
  const prev = rec.prev;
  const hasPrevData = !!prev && prev.hasData;
  const eff = new Set(effectivePresent(cur, [...present])); // 이 광고 기준 구매 근거 반영(혼합 CSV 안전)
  const groups = computeMetricGroups(cur, hasPrevData ? prev! : null, rec.creativeType, hasPrevData);
  applyMissingColumns(groups, eff);

  const s = adjustSettings(settings, eff);
  const contribution = contributionFor(dataset, rec, "adset");
  const verdict = evaluate({
    cur,
    prev: hasPrevData ? prev! : null,
    hasPrevData,
    creativeType: rec.creativeType,
    daysRunning: 9999,
    groups,
    contributionSpendShare: contribution.spendShare,
    contributionRevenue: contribution.revenueContribution,
    settings: s,
  });

  const missingDiagnoses: string[] = [];
  if (!present.has("linkClicks")) missingDiagnoses.push("링크 클릭 데이터가 없어 클릭 관련 진단을 하지 못했습니다.");
  if (!present.has("landingPageViews")) missingDiagnoses.push("랜딩 데이터가 없어 랜딩/전환 관련 진단을 하지 못했습니다.");
  if (!eff.has("purchases")) missingDiagnoses.push("구매 데이터가 없어 전환/기여도 진단을 하지 못했습니다.");
  if (rec.creativeType === "video" && !present.has("video3s"))
    missingDiagnoses.push("영상 데이터가 없어 영상 진단을 하지 못했습니다.");

  return {
    ad: toAd(rec),
    range,
    prevRange,
    cur,
    prev: hasPrevData ? prev! : null,
    hasPrevData,
    daysRunning: 9999,
    groups,
    verdict,
    current: [],
    previous: [],
    record: rec,
    missingDiagnoses,
    creativeTypeAuto: rec.creativeTypeAuto,
    isNew: rec.match === "current_only" && dataset.counts.previous > 0,
  };
}

// 전체 광고계정 요약 ────────────────────────────────────────────
export function accountOverviewCsv(dataset: Dataset, accountKey: string, settings: AnalysisSettings): AccountOverview {
  const present = presentSet(dataset);
  const acc = dataset.accounts.find((a) => a.key === accountKey);
  const adKeys: string[] = [];
  if (acc) for (const ck of acc.campaignKeys) {
    const camp = dataset.campaigns.get(ck)!;
    for (const sk of camp.adSetKeys) adKeys.push(...currentAdKeys(dataset, sk));
  }

  let curTotal = emptyAgg();
  let prevTotal = emptyAgg();
  for (const k of adKeys) {
    const rec = dataset.recordsByKey.get(k)!;
    if (rec.cur) curTotal = sumAgg(curTotal, rec.cur);
    if (rec.prev) prevTotal = sumAgg(prevTotal, rec.prev);
  }
  const hasPrevData = prevTotal.hasData;

  const ads: AdOverview[] = adKeys.map((k) => {
    const rec = dataset.recordsByKey.get(k)!;
    const cur = rec.cur ?? emptyAgg();
    const prev = rec.prev ?? emptyAgg();
    const rollup = rollupForKeys(dataset, [k], settings, rec.creativeType);
    const contrib = contributionFor(dataset, rec, "account");
    const curRoas = cur.spend > 0 && cur.purchaseValue > 0 ? (cur.purchaseValue / cur.spend) * 100 : null;
    const prevRoas = prev.spend > 0 && prev.purchaseValue > 0 ? (prev.purchaseValue / prev.spend) * 100 : null;
    const roasChangePct =
      rec.prev && prevRoas !== null && prevRoas > 0 && curRoas !== null
        ? ((curRoas - prevRoas) / prevRoas) * 100
        : null;
    return {
      adId: k,
      name: rec.adName,
      creativeType: rec.creativeType,
      spend: cur.spend,
      roas: rollup.roas,
      cpa: rollup.cpa,
      verdictCode: rollup.verdictCode,
      revenueVsSpend: contrib.revenueVsSpend,
      purchaseVsSpend: contrib.purchaseVsSpend,
      roasChangePct,
      hasMinData: cur.spend >= settings.minSpend && cur.impressions >= settings.minImpressions,
    };
  });

  void present;
  return { cur: curTotal, prev: hasPrevData ? prevTotal : null, hasPrevData, ads };
}
