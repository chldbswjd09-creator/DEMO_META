// 분석 자료 계산 — 기존 지표 계산(calc)·판정(engine)을 재사용한다.
// 합산 시 비율 지표는 개별 결과를 평균 내지 않고, 원본값을 합친 뒤 다시 계산한다.

import type {
  AggregatedInsight,
  AnalysisSettings,
  CreativeType,
  MetricGroup,
  MetricResult,
  Verdict,
} from "@/lib/types";
import { computeMetricGroups, emptyAgg, findMetric } from "@/lib/metrics/calc";
import { evaluate } from "@/lib/verdict/engine";
import { adjustSettings, applyMissingColumns, effectivePresent, sumAgg, type CsvAdAnalysis } from "@/lib/csv/analyze";
import { buildDataset, creativeTypeFromName, type Dataset } from "@/lib/csv/dataset";
import type { ParsedFile } from "@/lib/csv/parse";
import type { PerfField } from "@/lib/csv/columnMap";
import type { Material, MaterialAdRow, MaterialAnalysis } from "@/lib/materials/types";

function toParsedFile(m: Material): ParsedFile {
  return {
    fileName: m.file.name,
    fileSize: m.file.size,
    encoding: m.file.encoding as ParsedFile["encoding"],
    delimiter: m.file.delimiter as ParsedFile["delimiter"],
    headers: m.headers,
    rows: m.rows,
    rowCount: m.rows.length,
  };
}

// 영상 데이터가 있으면 영상으로 간주 (자료 전체 기준)
function aggCreativeType(agg: AggregatedInsight, present: PerfField[]): CreativeType {
  return present.includes("video3s") && agg.video3s > 0 ? "video" : "other";
}

export function verdictForAgg(
  agg: AggregatedInsight,
  present: PerfField[],
  settings: AnalysisSettings,
): Verdict {
  if (!agg.hasData) {
    return {
      code: "data_insufficient",
      confidence: "낮음",
      dataSufficiency: "부족",
      reasons: ["집계된 데이터가 없습니다."],
      action: "데이터 확인이 필요합니다.",
    };
  }
  const eff = effectivePresent(agg, present);
  const presentSet = new Set(eff);
  const ct = aggCreativeType(agg, present);
  const groups = computeMetricGroups(agg, null, ct, false);
  applyMissingColumns(groups, presentSet);
  return evaluate({
    cur: agg,
    prev: null,
    hasPrevData: false,
    creativeType: ct,
    daysRunning: 9999,
    groups,
    contributionSpendShare: null,
    contributionRevenue: null,
    settings: adjustSettings(settings, presentSet),
  });
}

export function metricGroupsForAgg(agg: AggregatedInsight, present: PerfField[]): MetricGroup[] {
  const groups = computeMetricGroups(agg, null, aggCreativeType(agg, present), false);
  applyMissingColumns(groups, new Set(effectivePresent(agg, present)));
  return groups;
}

// 자료의 Dataset (광고별 상세 재사용용)
export function materialDataset(m: Material): Dataset {
  return buildDataset([toParsedFile(m)], [], m.mapping);
}

// 자료 1개 분석 (CSV 내부에서 광고 ID 기준 합산; 날짜별 행 합산, 완전 중복 행만 경고)
export function buildMaterialAnalysis(m: Material, settings: AnalysisSettings): MaterialAnalysis {
  const ds = materialDataset(m);
  const present = ds.presentPerfFields;
  const ads: MaterialAdRow[] = [];
  let total = emptyAgg();
  for (const rec of ds.recordsByKey.values()) {
    if (!rec.cur) continue;
    total = sumAgg(total, rec.cur);
    ads.push({
      key: rec.key,
      adId: rec.adId,
      accountName: rec.accountName,
      campaignName: rec.campaignName,
      adSetName: rec.adSetName,
      adName: rec.adName,
      adSetKey: rec.adSetKey,
      creativeType: rec.creativeType,
      agg: rec.cur,
    });
  }
  return {
    id: m.id,
    name: m.name,
    tags: m.tags,
    periodStart: m.periodStart || ds.period.current?.start,
    periodEnd: m.periodEnd || ds.period.current?.end,
    present,
    total,
    ads,
    adCount: ads.length,
    verdict: verdictForAgg(total, present, settings),
    warnings: ds.warnings.map((w) => w.message),
  };
}

// ── 중복 검사 ────────────────────────────────────────────────
export interface DupKey {
  key: string;
  label: string;
  materialIds: string[];
}

function adDedupKey(ad: MaterialAdRow, m: MaterialAnalysis): string {
  const idPart = ad.adId ? `id:${ad.adId}` : `nm:${ad.accountName}|${ad.campaignName}|${ad.adSetName}|${ad.adName}`;
  return `${idPart}||${m.periodStart ?? ""}||${m.periodEnd ?? ""}`;
}

export function detectDuplicates(analyses: MaterialAnalysis[]): DupKey[] {
  const map = new Map<string, { label: string; mats: Set<string> }>();
  for (const m of analyses) {
    for (const ad of m.ads) {
      const k = adDedupKey(ad, m);
      const e = map.get(k) ?? { label: `${ad.adName} (${m.periodStart ?? "?"}~${m.periodEnd ?? "?"})`, mats: new Set<string>() };
      e.mats.add(m.id);
      map.set(k, e);
    }
  }
  return [...map.entries()]
    .filter(([, e]) => e.mats.size > 1)
    .map(([key, e]) => ({ key, label: e.label, materialIds: [...e.mats] }));
}

// ── 합산 ─────────────────────────────────────────────────────
export type DedupMode = "exclude" | "include";

export interface AggregateResult {
  agg: AggregatedInsight;
  present: PerfField[];
  groups: MetricGroup[];
  verdict: Verdict;
  adCount: number;
  materialCount: number;
  duplicates: DupKey[];
  reachEstimated: boolean;
}

export function aggregateMaterials(
  analyses: MaterialAnalysis[],
  mode: DedupMode,
  settings: AnalysisSettings,
): AggregateResult {
  const duplicates = detectDuplicates(analyses);
  // 원본 열 present는 선택 자료의 교집합 (모두 있어야 정확 합산 가능)
  let present: PerfField[] | null = null;
  for (const m of analyses) present = present === null ? [...m.present] : present.filter((f) => m.present.includes(f));
  const presentArr = present ?? [];

  const seen = new Set<string>();
  let agg = emptyAgg();
  let adCount = 0;
  for (const m of analyses) {
    for (const ad of m.ads) {
      const k = adDedupKey(ad, m);
      if (mode === "exclude" && seen.has(k)) continue;
      seen.add(k);
      agg = sumAgg(agg, ad.agg);
      adCount++;
    }
  }

  return {
    agg,
    present: presentArr,
    groups: metricGroupsForAgg(agg, presentArr),
    verdict: verdictForAgg(agg, presentArr, settings),
    adCount,
    materialCount: analyses.length,
    duplicates,
    reachEstimated: analyses.length > 1,
  };
}

// ── 비교 ─────────────────────────────────────────────────────
export interface CompareMetricRow {
  key: string;
  label: string;
  unit: MetricResult["unit"];
  direction: MetricResult["direction"];
  values: (number | null)[]; // 자료별
  bestIndex: number | null;
}
export interface CompareRawRow {
  key: string;
  label: string;
  values: number[];
}
export interface CompareResult {
  materials: { id: string; name: string; periodStart?: string; periodEnd?: string; adCount: number }[];
  rawRows: CompareRawRow[];
  metricRows: CompareMetricRow[];
}

const METRIC_ORDER = [
  "cpm", "frequency", "ctr", "cpc", "landingRate", "landingCost",
  "purchaseRate", "cpa", "aov", "roas", "hookRate", "holdRate", "completionRate",
];

export function compareMaterials(analyses: MaterialAnalysis[]): CompareResult {
  const perGroups = analyses.map((m) => metricGroupsForAgg(m.total, m.present));

  const rawRows: CompareRawRow[] = [
    { key: "adCount", label: "광고 수", values: analyses.map((m) => m.adCount) },
    { key: "spend", label: "광고비", values: analyses.map((m) => m.total.spend) },
    { key: "impressions", label: "노출", values: analyses.map((m) => m.total.impressions) },
    { key: "reach", label: "도달", values: analyses.map((m) => m.total.reach) },
    { key: "linkClicks", label: "링크 클릭", values: analyses.map((m) => m.total.linkClicks) },
    { key: "landingPageViews", label: "랜딩페이지 조회", values: analyses.map((m) => m.total.landingPageViews) },
    { key: "purchases", label: "구매", values: analyses.map((m) => m.total.purchases) },
    { key: "purchaseValue", label: "구매 매출", values: analyses.map((m) => m.total.purchaseValue) },
  ];

  const metricRows: CompareMetricRow[] = METRIC_ORDER.map((key) => {
    const sample = findMetric(perGroups[0], key)!;
    const values = perGroups.map((g) => {
      const mm = findMetric(g, key);
      return mm && mm.state === "ok" ? mm.current : null;
    });
    // 유리한 값 강조 (데이터 없는 값은 후보에서 제외)
    let bestIndex: number | null = null;
    const withIdx = values.map((v, i) => ({ v, i })).filter((x) => x.v !== null) as { v: number; i: number }[];
    if (sample.direction !== "neutral" && withIdx.length > 0) {
      const best = withIdx.reduce((a, b) =>
        sample.direction === "higher_better" ? (b.v > a.v ? b : a) : b.v < a.v ? b : a,
      );
      bestIndex = best.i;
    }
    return { key, label: sample.label, unit: sample.unit, direction: sample.direction, values, bestIndex };
  });

  return {
    materials: analyses.map((m) => ({ id: m.id, name: m.name, periodStart: m.periodStart, periodEnd: m.periodEnd, adCount: m.adCount })),
    rawRows,
    metricRows,
  };
}

// ── 자료/합산을 기존 요약·지표 컴포넌트로 표시하기 위한 합성 분석 ──
export function synthAnalysis(name: string, agg: AggregatedInsight, present: PerfField[], settings: AnalysisSettings): CsvAdAnalysis {
  // 광고 이름에 유형 표기(_image_/_video_)가 있으면 우선. 없을 때만(자료 전체 등) 데이터로 대체.
  const ct = creativeTypeFromName(name) ?? aggCreativeType(agg, present);
  const groups = metricGroupsForAgg(agg, present);
  const verdict = verdictForAgg(agg, present, settings);
  return {
    ad: { id: "synth", adSetId: "synth", name, status: "active", creativeType: ct, thumbnailUrl: undefined, createdTime: "" },
    range: { start: "", end: "" },
    prevRange: { start: "", end: "" },
    cur: agg,
    prev: null,
    hasPrevData: false,
    daysRunning: 9999,
    groups,
    verdict,
    current: [],
    previous: [],
    record: {
      key: "synth", adId: undefined, adName: name, adSetKey: "synth", adSetId: undefined, adSetName: "",
      campaignKey: "synth", campaignId: undefined, campaignName: "", accountKey: "synth", accountId: undefined,
      accountName: "", adStatus: undefined, creativeType: ct, creativeTypeAuto: false, cur: agg, prev: null,
      match: "current_only", hasNoId: false, nameDuplicate: false,
    },
    missingDiagnoses: [],
    creativeTypeAuto: false,
    isNew: false,
  };
}
