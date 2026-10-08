// 기간 A vs 기간 B 성과 비교 (순수 계산). 기존 통합/계산/판정 로직을 재사용만 한다.
// - 각 기간은 여러 자료를 integrate()로 raw 합산 후 재계산(비율 지표 평균 금지).
// - raw volume(광고비/노출/클릭/LPV/구매/구매매출)은 '실제 데이터 포함일'로 나눠 일평균 비교.
// - CTR/CPC/CVR/CPA/ROAS 등 비율은 합산 원본에서 재계산한 통합값끼리 비교.
// - 원본 열이 없으면 계산 불가로 유지(임의 0/추정 금지). 비교 판정은 기존 판정을 덮어쓰지 않는 별도 상태.

import type { AnalysisSettings, AggregatedInsight, CreativeType } from "@/lib/types";
import type { PerfField } from "@/lib/csv/columnMap";
import type { Material, MaterialAnalysis } from "@/lib/materials/types";
import { integrate, mergeKeyOf, type MergedAd } from "@/lib/materials/integrate";
import { metricGroupsForAgg } from "@/lib/materials/compute";
import { emptyAgg, findMetric } from "@/lib/metrics/calc";
import { sumAgg } from "@/lib/csv/analyze";
import { estRoasOf } from "@/lib/materials/profitView";

// ── 실제 데이터 포함일(unique dates) ─────────────────────────────
// 일자 열이 있으면 실제 존재하는 고유 날짜만 센다(없는 날짜를 0으로 만들지 않음).
// 일자 열이 없을 때만 보고 기간(periodStart~periodEnd) 달력 범위를 분모로 사용한다.
function enumerateDates(start: string, end: string): string[] {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return Number.isNaN(s) ? [] : [start];
  const out: string[] = [];
  for (let t = s; t <= e && out.length < 800; t += 86_400_000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function materialDates(m: Material): string[] {
  const dateH = m.mapping.date?.header ?? null;
  if (dateH) {
    const set = new Set<string>();
    for (const r of m.rows) {
      const v = (r[dateH] ?? "").trim();
      if (v) set.add(v);
    }
    if (set.size) return [...set];
  }
  const start = m.periodStart;
  const end = m.periodEnd || m.periodStart;
  if (start && end) return enumerateDates(start, end);
  if (start) return [start];
  return [];
}

export function groupDataDays(mats: Material[]): number {
  const set = new Set<string>();
  for (const m of mats) for (const d of materialDates(m)) set.add(d);
  return set.size;
}

// ── 일평균 집행 소재 수 ──────────────────────────────────────────
// '각 날짜에 실제 집행된 소재 수'의 평균. 기간 내 고유 소재 수 ÷ 일수(착시)를 쓰지 않는다.
// 집행 판정: 해당 날짜 CSV raw에서 광고비 지출 > 0 인 광고(현재 운영 상태가 아니라 그날 실제 성과 기준).
function rowNum(raw: string | undefined): number {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (s === "" || s === "-" || s === "—") return 0;
  const c = s.replace(/[^0-9.\-]/g, "");
  const n = Number(c);
  return Number.isFinite(n) ? n : 0;
}
function adKeyOfRow(m: Material, row: Record<string, string>): string {
  const idH = m.mapping.adId?.header;
  const nmH = m.mapping.adName?.header;
  const adId = idH ? (row[idH] ?? "").trim() || undefined : undefined;
  const adName = nmH ? (row[nmH] ?? "").trim() : "";
  return mergeKeyOf(adId, adName || adId || "(광고명 없음)");
}

// 날짜별 '집행(광고비>0) 소재' 집합. 광고비 열이 없으면 판별 불가(null).
function activeCreativesPerDate(mats: Material[]): Map<string, Set<string>> | null {
  const byDate = new Map<string, Set<string>>();
  const add = (date: string, adKey: string) => {
    const s = byDate.get(date) ?? new Set<string>();
    s.add(adKey);
    byDate.set(date, s);
  };
  for (const m of mats) {
    const spendH = m.mapping.spend?.header;
    if (!spendH) return null; // 광고비 열 없음 → 임의 집행 추정 금지 → 전체 계산 불가
    const dateH = m.mapping.date?.header;
    if (dateH) {
      // 일자 열 있음: (날짜, 광고)별 광고비 합산 후 > 0 이면 그 날 집행
      const acc = new Map<string, Map<string, number>>();
      for (const row of m.rows) {
        const date = (row[dateH] ?? "").trim();
        if (!date) continue;
        const k = adKeyOfRow(m, row);
        const dm = acc.get(date) ?? new Map<string, number>();
        dm.set(k, (dm.get(k) ?? 0) + rowNum(row[spendH]));
        acc.set(date, dm);
      }
      for (const [date, dm] of acc) for (const [k, sp] of dm) if (sp > 0) add(date, k);
    } else {
      // 일자 열 없음(범위 집계): 광고비>0 소재를 해당 자료의 각 날짜에 귀속(보고 기간 기준, dataDays와 동일 fallback)
      const acc = new Map<string, number>();
      for (const row of m.rows) acc.set(adKeyOfRow(m, row), (acc.get(adKeyOfRow(m, row)) ?? 0) + rowNum(row[spendH]));
      const active = [...acc].filter(([, sp]) => sp > 0).map(([k]) => k);
      for (const date of materialDates(m)) for (const k of active) add(date, k);
    }
  }
  return byDate;
}

// 일평균 집행 소재 수 = Σ(날짜별 집행 소재 수) ÷ 데이터 포함일. 광고비 판별 불가면 null.
export function dailyActiveCreatives(mats: Material[], dataDays: number): number | null {
  if (dataDays <= 0) return null;
  const byDate = activeCreativesPerDate(mats);
  if (byDate === null) return null;
  let total = 0;
  for (const s of byDate.values()) total += s.size;
  return total / dataDays;
}

// ── 그룹(기간) 집계 ──────────────────────────────────────────────
export interface GroupResult {
  name: string;
  dataDays: number; // 실제 데이터 포함일(일평균 분모)
  agg: AggregatedInsight; // 통합 총계(raw 합산)
  present: PerfField[]; // 선택 자료 교집합 원본 열
  merged: MergedAd[]; // 동일 광고 병합 결과(mergeKey)
  materialCount: number;
  adCount: number; // 기간 내 고유 소재 수(참고용 — 기간 길이 착시 때문에 판단에 사용하지 않음)
  dailyActive: number | null; // 일평균 집행 소재 수(운영량 비교 기준)
  roas: number | null; // 통합 추정 ROAS
  periodStart?: string;
  periodEnd?: string;
}

export function computeGroup(
  name: string,
  analyses: MaterialAnalysis[],
  dataDays: number,
  settings: AnalysisSettings,
  dailyActive: number | null = null,
): GroupResult {
  const r = integrate(analyses, "exclude", settings);
  const starts = analyses.map((m) => m.periodStart).filter(Boolean) as string[];
  const ends = analyses.map((m) => m.periodEnd).filter(Boolean) as string[];
  return {
    name,
    dataDays,
    agg: r.totalAgg,
    present: r.present,
    merged: r.merged,
    materialCount: analyses.length,
    adCount: r.merged.length,
    dailyActive,
    roas: r.integratedEstimatedRoas,
    periodStart: starts.length ? starts.reduce((a, b) => (a < b ? a : b)) : undefined,
    periodEnd: ends.length ? ends.reduce((a, b) => (a > b ? a : b)) : undefined,
  };
}

// ── 지표 추출(합산 원본 → 재계산) ────────────────────────────────
export interface AdMetrics {
  dataDays: number;
  dayAvgSpend: number | null;
  dayAvgImpr: number | null;
  dayAvgClicks: number | null;
  dayAvgLpv: number | null;
  dayAvgPurchase: number | null;
  dayAvgRevenue: number | null;
  impressions: number | null;
  cpm: number | null;
  ctr: number | null;
  cpc: number | null;
  landingRate: number | null;
  cvr: number | null;
  cpa: number | null;
  roas: number | null;
  spendTotal: number | null;
  purchaseTotal: number | null;
  lpvTotal: number | null; // CVR 분모(랜딩 페이지 조회) — 기존 CVR 엔진과 동일 값
  linkClicksTotal: number | null; // 표본 충분도 판단용
}

function dayAvg(agg: AggregatedInsight, present: PerfField[], field: PerfField, value: number, days: number): number | null {
  if (!present.includes(field) || days <= 0) return null;
  return value / days;
}

export function adMetricsOf(agg: AggregatedInsight, present: PerfField[], dataDays: number): AdMetrics {
  const g = metricGroupsForAgg(agg, present);
  const mv = (k: string): number | null => {
    const m = findMetric(g, k);
    return m && m.state === "ok" && m.current != null ? m.current : null;
  };
  const has = (f: PerfField) => present.includes(f);
  return {
    dataDays,
    dayAvgSpend: dayAvg(agg, present, "spend", agg.spend, dataDays),
    dayAvgImpr: dayAvg(agg, present, "impressions", agg.impressions, dataDays),
    dayAvgClicks: dayAvg(agg, present, "linkClicks", agg.linkClicks, dataDays),
    dayAvgLpv: dayAvg(agg, present, "landingPageViews", agg.landingPageViews, dataDays),
    dayAvgPurchase: dayAvg(agg, present, "purchases", agg.purchases, dataDays),
    dayAvgRevenue: dayAvg(agg, present, "purchaseValue", agg.purchaseValue, dataDays),
    impressions: has("impressions") ? agg.impressions : null,
    cpm: mv("cpm"), // 총 광고비/총 노출×1000 (합산 agg에서 재계산, 평균 아님)
    ctr: mv("ctr"),
    cpc: mv("cpc"),
    landingRate: mv("landingRate"),
    cvr: mv("purchaseRate"),
    cpa: mv("cpa"),
    roas: estRoasOf(agg, present),
    spendTotal: has("spend") ? agg.spend : null,
    purchaseTotal: has("purchases") ? agg.purchases : null,
    lpvTotal: has("landingPageViews") ? agg.landingPageViews : null,
    linkClicksTotal: has("linkClicks") ? agg.linkClicks : null,
  };
}

// 구매/CVR 표본 부족 여부 — 기존 운영 판단 기준(구매≤2 또는 링크클릭<30) 재사용.
// 두 기간 중 어느 쪽이라도 표본이 작으면 증감률/CVR을 '참고용'으로 낮춘다.
const SAMPLE_MIN_CLICKS = 30;
const SAMPLE_MIN_PURCH = 3; // 3 미만(=1~2 또는 0)
function sampleWeakOne(m: AdMetrics): boolean {
  return (m.purchaseTotal != null && m.purchaseTotal < SAMPLE_MIN_PURCH) || (m.linkClicksTotal != null && m.linkClicksTotal < SAMPLE_MIN_CLICKS);
}
export function purchaseSampleWeak(a: AdMetrics, b: AdMetrics): boolean {
  return sampleWeakOne(a) || sampleWeakOne(b);
}

// ── 전체 성과 비교 행 ────────────────────────────────────────────
export type ChangeKind = "pct" | "pp" | "none";
export interface CompareRow {
  key: string;
  label: string;
  unit: "krw" | "count" | "pct" | "ratio";
  changeKind: ChangeKind;
  a: number | null;
  b: number | null;
  aTotal?: number | null; // 누적값 보조 표기(일평균 행에만)
  bTotal?: number | null;
}

export function relPct(a: number | null, b: number | null): number | null {
  if (a == null || b == null || a === 0) return null;
  return ((b - a) / a) * 100;
}
export function ppDiff(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return b - a;
}

export function overallRows(A: GroupResult, B: GroupResult): CompareRow[] {
  const am = adMetricsOf(A.agg, A.present, A.dataDays);
  const bm = adMetricsOf(B.agg, B.present, B.dataDays);
  const vol = (key: string, label: string, unit: "krw" | "count", aAvg: number | null, bAvg: number | null, aTot: number | null, bTot: number | null): CompareRow => ({
    key, label, unit, changeKind: "pct", a: aAvg, b: bAvg, aTotal: aTot, bTotal: bTot,
  });
  const ratio = (key: string, label: string, unit: "krw" | "pct" | "ratio", changeKind: ChangeKind, a: number | null, b: number | null): CompareRow => ({
    key, label, unit, changeKind, a, b,
  });
  return [
    { key: "dataDays", label: "데이터 포함일", unit: "count", changeKind: "none", a: A.dataDays, b: B.dataDays },
    { key: "dailyActive", label: "일평균 집행 소재 수", unit: "count", changeKind: "pct", a: A.dailyActive, b: B.dailyActive },
    vol("spend", "일평균 광고비", "krw", am.dayAvgSpend, bm.dayAvgSpend, am.spendTotal, bm.spendTotal),
    vol("impr", "일평균 노출", "count", am.dayAvgImpr, bm.dayAvgImpr, A.present.includes("impressions") ? A.agg.impressions : null, B.present.includes("impressions") ? B.agg.impressions : null),
    vol("clicks", "일평균 링크 클릭", "count", am.dayAvgClicks, bm.dayAvgClicks, A.present.includes("linkClicks") ? A.agg.linkClicks : null, B.present.includes("linkClicks") ? B.agg.linkClicks : null),
    vol("lpv", "일평균 랜딩 조회", "count", am.dayAvgLpv, bm.dayAvgLpv, A.present.includes("landingPageViews") ? A.agg.landingPageViews : null, B.present.includes("landingPageViews") ? B.agg.landingPageViews : null),
    vol("purchase", "일평균 구매", "count", am.dayAvgPurchase, bm.dayAvgPurchase, am.purchaseTotal, bm.purchaseTotal),
    vol("revenue", "일평균 구매매출", "krw", am.dayAvgRevenue, bm.dayAvgRevenue, A.present.includes("purchaseValue") ? A.agg.purchaseValue : null, B.present.includes("purchaseValue") ? B.agg.purchaseValue : null),
    ratio("cpm", "CPM", "krw", "pct", am.cpm, bm.cpm),
    ratio("ctr", "CTR", "pct", "pp", am.ctr, bm.ctr),
    ratio("cpc", "CPC", "krw", "pct", am.cpc, bm.cpc),
    ratio("landingRate", "랜딩 도달률", "pct", "pp", am.landingRate, bm.landingRate),
    ratio("cvr", "구매전환율(CVR)", "pct", "pp", am.cvr, bm.cvr),
    ratio("cpa", "CPA", "krw", "pct", am.cpa, bm.cpa),
    ratio("roas", "ROAS", "pct", "pp", am.roas, bm.roas),
  ];
}

// ── 동일 소재 변화 판정(비교 전용, 기존 판정과 별개) ──────────────
export type CompareStatus = "improved" | "worsened" | "limited" | "insufficient";
export const COMPARE_STATUS_LABEL: Record<CompareStatus, string> = {
  improved: "효율 개선",
  worsened: "효율 악화",
  limited: "변화 제한적",
  insufficient: "비교 데이터 부족",
};

const MIN_DAYS = 3; // 3일 미만 → 초기/추가 관찰
const MIN_IMPR = 1500; // 충분 노출 기준(내부)

// 하나의 지표만 보지 않고 ROAS/CPA(수익성) 가중 + CTR/CVR로 종합.
function signal(a: number | null, b: number | null, higherBetter: boolean, thresholdPct = 5): number {
  const rel = relPct(a, b);
  if (rel == null) return 0;
  const improved = higherBetter ? rel > thresholdPct : rel < -thresholdPct;
  const worsened = higherBetter ? rel < -thresholdPct : rel > thresholdPct;
  return improved ? 1 : worsened ? -1 : 0;
}

export function compareStatusOf(a: AdMetrics, b: AdMetrics, bDataDays: number): CompareStatus {
  // 데이터 부족: 변경 후 기간이 짧거나 노출이 충분치 않으면 개선/악화를 확정하지 않는다.
  const bInsufficient = bDataDays < MIN_DAYS || b.impressions == null || b.impressions < MIN_IMPR;
  const comparable = [a.roas, b.roas, a.cpa, b.cpa, a.ctr, b.ctr].some((x) => x != null);
  if (bInsufficient || !comparable) return "insufficient";
  // 구매 표본이 작으면 CVR(구매 파생) 신호의 신뢰도를 낮춘다(가중치 0). ROAS/CPA/CTR는 그대로.
  const cvrWeight = purchaseSampleWeak(a, b) ? 0 : 1;
  const score =
    2 * signal(a.roas, b.roas, true) +
    2 * signal(a.cpa, b.cpa, false) +
    1 * signal(a.ctr, b.ctr, true) +
    cvrWeight * signal(a.cvr, b.cvr, true);
  if (score >= 2) return "improved";
  if (score <= -2) return "worsened";
  return "limited";
}

export interface SameAdRow {
  mergeKey: string;
  adName: string;
  adId?: string;
  creativeType: CreativeType;
  a: AdMetrics;
  b: AdMetrics;
  status: CompareStatus;
  sampleWeak: boolean; // 구매/CVR 표본 부족(구매≤2 또는 링크클릭<30) → 증감률 참고용
}

// ── 소재 구성 그룹 요약(A만/B만/공통) ───────────────────────────
export interface GroupSummary {
  count: number;
  spendTotal: number | null;
  spendSharePct: number | null; // 해당 기간 전체 광고비 대비 비중
  purchaseTotal: number | null;
  ctr: number | null;
  cpa: number | null;
  roas: number | null;
  dayAvgSpend: number | null;
}

function summarizeAds(ads: MergedAd[], present: PerfField[], groupSpendTotal: number, dataDays: number): GroupSummary {
  let agg = emptyAgg();
  for (const ad of ads) agg = sumAgg(agg, ad.agg);
  const m = adMetricsOf(agg, present, dataDays);
  const spendTotal = present.includes("spend") ? agg.spend : null;
  return {
    count: ads.length,
    spendTotal,
    spendSharePct: spendTotal != null && groupSpendTotal > 0 ? (spendTotal / groupSpendTotal) * 100 : null,
    purchaseTotal: m.purchaseTotal,
    ctr: m.ctr,
    cpa: m.cpa,
    roas: m.roas,
    dayAvgSpend: m.dayAvgSpend,
  };
}

// ── 자동 요약(④) ────────────────────────────────────────────────
export type SummaryCase = "A" | "B" | "C" | "D" | "E" | "neutral";
export interface CompareSummary {
  caseId: SummaryCase;
  bDataShort: boolean;
  overallImproved: boolean | null; // ROAS 기준(계산 불가면 null)
  sameAdImproved: boolean | null;
  sentence: string;
}

function combinedRoas(ads: MergedAd[], present: PerfField[]): number | null {
  let agg = emptyAgg();
  for (const ad of ads) agg = sumAgg(agg, ad.agg);
  return estRoasOf(agg, present);
}

export function buildSummary(
  A: GroupResult,
  B: GroupResult,
  sameKeys: string[],
  aMergedByKey: Map<string, MergedAd>,
  bMergedByKey: Map<string, MergedAd>,
  excludedAds: MergedAd[],
): CompareSummary {
  const bDataShort = B.dataDays < MIN_DAYS;

  const overallImproved = A.roas != null && B.roas != null ? B.roas > A.roas * 1.02 : null;
  const overallWorsened = A.roas != null && B.roas != null ? B.roas < A.roas * 0.98 : null;

  // 동일 소재 통합 ROAS(공통 소재만 각 기간 합산 후 재계산)
  const sameA = combinedRoas(sameKeys.map((k) => aMergedByKey.get(k)!).filter(Boolean), A.present);
  const sameB = combinedRoas(sameKeys.map((k) => bMergedByKey.get(k)!).filter(Boolean), B.present);
  const sameAdImproved = sameA != null && sameB != null ? sameB > sameA * 1.02 : null;
  const sameAdWorsened = sameA != null && sameB != null ? sameB < sameA * 0.98 : null;

  // 제외 소재가 '저성과'인지: 제외 소재 통합 ROAS < 변경 전 전체 ROAS
  const exclRoas = combinedRoas(excludedAds, A.present);
  const excludedLowPerf = exclRoas != null && A.roas != null ? exclRoas < A.roas : excludedAds.length > 0;
  const manyExcluded = excludedAds.length > 0;

  let caseId: SummaryCase;
  let sentence: string;
  if (bDataShort) {
    caseId = "E";
    sentence = "변경 후 데이터가 아직 충분하지 않아(3일 미만) 현재 결과는 초기 변화로만 확인해주세요. 동일 소재·제외 소재 성과를 함께 추가 관찰이 필요합니다.";
  } else if (overallWorsened === true && sameAdWorsened === true) {
    caseId = "D";
    sentence = "변경 후 전체 운영 효율과 동일 소재 성과가 모두 낮아졌습니다. 변경 후 운영 조건과 주요 소재 성과를 추가 확인할 필요가 있습니다.";
  } else if (overallImproved === true && sameAdImproved === true) {
    caseId = "B";
    sentence = "전체 운영 성과가 개선됐으며, 변경 전후 동일하게 집행된 소재에서도 효율 개선이 확인됩니다. 소재 구성 변화와 기존 소재 성과 개선이 함께 영향을 준 것으로 보입니다.";
  } else if (overallImproved === true && sameAdWorsened === true && excludedLowPerf && manyExcluded) {
    caseId = "C";
    sentence = "전체 성과는 개선됐지만 동일 소재의 효율은 낮아졌습니다. 전체 개선은 기존 소재 자체의 개선보다는 저성과 소재 제외에 따른 구성 변화 영향이 큰 것으로 보입니다.";
  } else if (overallImproved === true && sameAdImproved !== true && excludedLowPerf && manyExcluded) {
    caseId = "A";
    sentence = "전체 운영 성과는 개선됐으나 동일 소재의 효율 변화는 크지 않습니다. 변경 후 저성과 소재가 제외된 구성 변화의 영향이 큰 것으로 보입니다.";
  } else {
    caseId = "neutral";
    sentence = "전체 성과와 동일 소재 성과, 제외·신규 소재 구성을 함께 확인해주세요. 현재 데이터만으로는 특정 원인으로 단정하기 어렵습니다.";
  }
  return { caseId, bDataShort, overallImproved, sameAdImproved, sentence };
}

// ── 최상위 비교 결과 ─────────────────────────────────────────────
export interface PeriodCompareResult {
  A: GroupResult;
  B: GroupResult;
  rows: CompareRow[];
  sameAds: SameAdRow[];
  excluded: MergedAd[]; // A에만 (변경 후 제외)
  newAds: MergedAd[]; // B에만 (신규)
  excludedSummary: GroupSummary;
  newSummary: GroupSummary;
  summary: CompareSummary;
}

export function comparePeriods(A: GroupResult, B: GroupResult): PeriodCompareResult {
  const aByKey = new Map(A.merged.map((m) => [m.mergeKey, m]));
  const bByKey = new Map(B.merged.map((m) => [m.mergeKey, m]));

  const sameKeys = [...aByKey.keys()].filter((k) => bByKey.has(k));
  const sameAds: SameAdRow[] = sameKeys.map((k) => {
    const a = aByKey.get(k)!;
    const b = bByKey.get(k)!;
    const am = adMetricsOf(a.agg, A.present, A.dataDays);
    const bm = adMetricsOf(b.agg, B.present, B.dataDays);
    return {
      mergeKey: k,
      adName: b.adName || a.adName,
      adId: a.adId ?? b.adId,
      creativeType: a.creativeType === "video" || b.creativeType === "video" ? "video" : a.creativeType,
      a: am,
      b: bm,
      status: compareStatusOf(am, bm, B.dataDays),
      sampleWeak: purchaseSampleWeak(am, bm),
    };
  });

  const excluded = A.merged.filter((m) => !bByKey.has(m.mergeKey));
  const newAds = B.merged.filter((m) => !aByKey.has(m.mergeKey));

  return {
    A,
    B,
    rows: overallRows(A, B),
    sameAds,
    excluded,
    newAds,
    excludedSummary: summarizeAds(excluded, A.present, A.agg.spend, A.dataDays),
    newSummary: summarizeAds(newAds, B.present, B.agg.spend, B.dataDays),
    summary: buildSummary(A, B, sameKeys, aByKey, bByKey, excluded),
  };
}

// mergeKeyOf 재노출(동일 소재 식별 규칙 재사용 확인용)
export { mergeKeyOf };
