// 지표 계산 — 서버 계산 규칙 (PLAN.md §13). 순수 함수로 유지해 테스트/재사용 가능.

import type {
  AggregatedInsight,
  ChangeNote,
  Contribution,
  CreativeType,
  DailyInsight,
  MetricGroup,
  MetricResult,
  MetricState,
  MetricUnit,
  VideoInsight,
} from "@/lib/types";

export function emptyAgg(): AggregatedInsight {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    linkClicks: 0,
    landingPageViews: 0,
    purchases: 0,
    purchaseValue: 0,
    video3s: 0,
    video25: 0,
    video50: 0,
    video75: 0,
    video95: 0,
    video100: 0,
    metaRevenueEst: 0,
    conversionComplete: true,
    hasData: false,
    hasVideoData: false,
    purchasesSource: "unavailable",
    purchaseValueSource: "unavailable",
    metaRoasSource: "unavailable",
  };
}

export function aggregate(
  dailies: DailyInsight[],
  videos: VideoInsight[],
): AggregatedInsight {
  const agg = emptyAgg();
  for (const d of dailies) {
    agg.spend += d.spend;
    agg.impressions += d.impressions;
    agg.reach += d.reach; // 근사(일별 합) — 실제 도달은 중복 제거 필요, 표기 시 주의
    agg.linkClicks += d.linkClicks;
    agg.landingPageViews += d.landingPageViews;
    agg.purchases += d.purchases;
    agg.purchaseValue += d.purchaseValue;
    if (!d.conversionComplete) agg.conversionComplete = false;
    agg.hasData = true;
  }
  for (const v of videos) {
    agg.video3s += v.video3s;
    agg.video50 += v.video50;
    agg.video100 += v.video100;
    if (v.videoComplete) agg.hasVideoData = true;
  }
  return agg;
}

// 안전 나눗셈 — 분모 0이면 null
function div(n: number, d: number): number | null {
  if (d === 0) return null;
  return n / d;
}

interface RawMetric {
  key: string;
  label: string;
  unit: MetricUnit;
  direction: MetricResult["direction"];
  value: number | null;
  state: MetricState;
  meaning: string;
  formula: string;
  source: string;
  interpret: string;
}

// 단일 기간의 지표 원시값 계산
function rawMetrics(agg: AggregatedInsight, creativeType: CreativeType): RawMetric[] {
  const isVideo = creativeType === "video";
  const cpm = div(agg.spend, agg.impressions);
  const frequency = div(agg.impressions, agg.reach);
  const ctr = div(agg.linkClicks, agg.impressions);
  const cpc = div(agg.spend, agg.linkClicks);
  const landingRate = div(agg.landingPageViews, agg.linkClicks);
  const landingCost = div(agg.spend, agg.landingPageViews);
  const purchaseRate = div(agg.purchases, agg.landingPageViews);
  const aov = div(agg.purchaseValue, agg.purchases);
  const hookRate = div(agg.video3s, agg.impressions);
  const holdRate = div(agg.video50, agg.video3s);
  const completionRate = div(agg.video100, agg.video3s);

  // CPA: 구매 0이면 no_purchase (0원 표기 금지)
  const cpaState: MetricState = agg.purchases === 0 ? "no_purchase" : "ok";
  const cpa = agg.purchases === 0 ? null : agg.spend / agg.purchases;

  // ROAS: 매출 없으면 계산 불가
  const roasState: MetricState =
    agg.spend === 0 ? "cannot_calc" : agg.purchaseValue === 0 ? "cannot_calc" : "ok";
  const roas = roasState === "ok" ? (agg.purchaseValue / agg.spend) * 100 : null;

  // 영상 지표: 영상 아님 → na, 영상인데 재생 데이터 없음 → no_data,
  // 분모 0(3초 재생 0 등) → no_data, 그 외 → ok. (이미지/캐러셀에 0% 표기 금지)
  const videoMetric = (v: number | null): { value: number | null; state: MetricState } => {
    if (!isVideo) return { value: null, state: "na" };
    if (!agg.hasVideoData) return { value: null, state: "no_data" };
    if (v === null) return { value: null, state: "no_data" };
    return { value: v * 100, state: "ok" };
  };
  const hook = videoMetric(hookRate);
  const hold = videoMetric(holdRate);
  const completion = videoMetric(completionRate);

  return [
    {
      key: "cpm",
      label: "CPM",
      unit: "krw_per_1000",
      direction: "lower_better",
      value: cpm === null ? null : cpm * 1000,
      state: cpm === null ? "cannot_calc" : "ok",
      meaning: "노출 1,000회당 비용",
      formula: "광고비 ÷ 노출 × 1,000",
      source: "spend, impressions",
      interpret: "낮을수록 노출 효율이 좋습니다.",
    },
    {
      key: "frequency",
      label: "빈도",
      unit: "ratio",
      direction: "neutral",
      value: frequency,
      state: frequency === null ? "cannot_calc" : "ok",
      meaning: "1인당 평균 노출 횟수",
      formula: "노출 ÷ 도달",
      source: "impressions, reach",
      interpret: "단독으로 좋고 나쁨을 판단하지 않습니다. 다른 지표와 함께 봅니다.",
    },
    {
      key: "ctr",
      label: "CTR",
      unit: "pct",
      direction: "higher_better",
      value: ctr === null ? null : ctr * 100,
      state: ctr === null ? "cannot_calc" : "ok",
      meaning: "링크 클릭률",
      formula: "링크 클릭 ÷ 노출 × 100",
      source: "inline_link_clicks, impressions",
      interpret: "높을수록 소재가 클릭을 잘 유도합니다. (링크 클릭 기준)",
    },
    {
      key: "cpc",
      label: "CPC",
      unit: "krw",
      direction: "lower_better",
      value: cpc,
      state: cpc === null ? "cannot_calc" : "ok",
      meaning: "링크 클릭당 비용",
      formula: "광고비 ÷ 링크 클릭",
      source: "spend, inline_link_clicks",
      interpret: "낮을수록 클릭 획득 효율이 좋습니다.",
    },
    {
      key: "landingRate",
      label: "랜딩 도달률",
      unit: "pct",
      direction: "higher_better",
      value: landingRate === null ? null : landingRate * 100,
      state: landingRate === null ? "cannot_calc" : "ok",
      meaning: "클릭 대비 랜딩페이지 도달 비율",
      formula: "랜딩페이지 조회 ÷ 링크 클릭 × 100",
      source: "landing_page_view, inline_link_clicks",
      interpret: "낮으면 로딩/링크/리디렉션 문제 가능성이 있습니다.",
    },
    {
      key: "landingCost",
      label: "랜딩 조회당 비용",
      unit: "krw",
      direction: "lower_better",
      value: landingCost,
      state: landingCost === null ? "cannot_calc" : "ok",
      meaning: "랜딩페이지 조회 1회당 비용",
      formula: "광고비 ÷ 랜딩페이지 조회",
      source: "spend, landing_page_view",
      interpret: "낮을수록 유효 방문 획득 효율이 좋습니다.",
    },
    {
      key: "purchaseRate",
      label: "구매 전환율",
      unit: "pct",
      direction: "higher_better",
      value: purchaseRate === null ? null : purchaseRate * 100,
      state: purchaseRate === null ? "cannot_calc" : "ok",
      meaning: "랜딩 방문 대비 구매 비율",
      formula: "구매 수 ÷ 랜딩페이지 조회 × 100",
      source: "purchase, landing_page_view",
      interpret: "낮으면 랜딩 이후 구매 설득/결제 과정 점검이 필요합니다.",
    },
    {
      key: "cpa",
      label: "CPA",
      unit: "krw",
      direction: "lower_better",
      value: cpa,
      state: cpaState,
      meaning: "구매 1건당 비용",
      formula: "광고비 ÷ 구매 수",
      source: "spend, purchase",
      interpret: "목표 CPA보다 낮을수록 좋습니다. 구매 0건이면 계산하지 않습니다.",
    },
    {
      key: "aov",
      label: "객단가",
      unit: "krw",
      direction: "higher_better",
      value: aov,
      state: aov === null ? "no_purchase" : "ok",
      meaning: "구매 1건당 평균 매출",
      formula: "구매 매출 ÷ 구매 수",
      source: "purchase_value, purchase",
      interpret: "높을수록 구매 단위 매출이 큽니다.",
    },
    {
      key: "roas",
      label: "ROAS",
      unit: "pct",
      direction: "higher_better",
      value: roas,
      state: roasState,
      meaning: "광고비 대비 매출 (배수×100)",
      formula: "구매 매출 ÷ 광고비 × 100",
      source: "purchase_value, spend",
      interpret: "목표 ROAS 이상이면 매출 효율이 좋습니다. 300%는 3배를 의미합니다.",
    },
    {
      key: "hookRate",
      label: "후킹률",
      unit: "pct",
      direction: "higher_better",
      value: hook.value,
      state: hook.state,
      meaning: "노출 대비 3초 이상 재생 비율",
      formula: "3초 이상 재생 ÷ 노출 × 100",
      source: "video_3s, impressions",
      interpret: "낮으면 첫 3초/썸네일/초기 소구 개선 가능성이 있습니다.",
    },
    {
      key: "holdRate",
      label: "유지율",
      unit: "pct",
      direction: "higher_better",
      value: hold.value,
      state: hold.state,
      meaning: "3초 재생 대비 50% 재생 비율",
      formula: "50% 재생 ÷ 3초 재생 × 100",
      source: "video_50, video_3s",
      interpret: "낮으면 중간 이탈이 많아 전개/길이 점검이 필요합니다.",
    },
    {
      key: "completionRate",
      label: "완주율",
      unit: "pct",
      direction: "higher_better",
      value: completion.value,
      state: completion.state,
      meaning: "3초 재생 대비 100% 재생 비율",
      formula: "100% 재생 ÷ 3초 재생 × 100",
      source: "video_100, video_3s",
      interpret: "낮으면 후반 구성/CTA 이전 이탈 점검이 필요합니다.",
    },
  ];
}

function changeOf(
  cur: number | null,
  prev: number | null,
  hasPrevData: boolean,
): { changePct: number | null; changeNote: ChangeNote } {
  if (!hasPrevData || prev === null) {
    return { changePct: null, changeNote: hasPrevData ? "normal" : "no_previous" };
  }
  if (prev === 0) {
    // 이전값 0 → 무한대 방지
    if (cur !== null && cur > 0) return { changePct: null, changeNote: "new" };
    return { changePct: null, changeNote: "normal" };
  }
  if (cur === null) return { changePct: null, changeNote: "normal" };
  return { changePct: ((cur - prev) / prev) * 100, changeNote: "normal" };
}

const GROUP_MAP: { key: MetricGroup["key"]; label: string; metrics: string[] }[] = [
  { key: "reach", label: "노출 효율", metrics: ["cpm", "frequency"] },
  { key: "click", label: "클릭 효율", metrics: ["ctr", "cpc"] },
  { key: "landing", label: "랜딩 도달", metrics: ["landingRate", "landingCost"] },
  { key: "purchase", label: "구매 전환", metrics: ["purchaseRate", "cpa"] },
  { key: "revenue", label: "매출 효율", metrics: ["aov", "roas"] },
  { key: "video", label: "영상 성과", metrics: ["hookRate", "holdRate", "completionRate"] },
];

export function computeMetricGroups(
  cur: AggregatedInsight,
  prev: AggregatedInsight | null,
  creativeType: CreativeType,
  hasPrevData: boolean,
): MetricGroup[] {
  const curRaw = rawMetrics(cur, creativeType);
  const prevRaw = prev ? rawMetrics(prev, creativeType) : null;
  const prevByKey = new Map(prevRaw?.map((m) => [m.key, m]) ?? []);

  const results = new Map<string, MetricResult>();
  for (const rm of curRaw) {
    const p = prevByKey.get(rm.key);
    const { changePct, changeNote } = changeOf(rm.value, p?.value ?? null, hasPrevData);
    results.set(rm.key, {
      key: rm.key,
      label: rm.label,
      unit: rm.unit,
      direction: rm.direction,
      current: rm.value,
      previous: p?.value ?? null,
      state: rm.state,
      changePct,
      changeNote,
      meaning: rm.meaning,
      formula: rm.formula,
      source: rm.source,
      interpret: rm.interpret,
    });
  }

  return GROUP_MAP.map((g) => ({
    key: g.key,
    label: g.label,
    metrics: g.metrics.map((k) => results.get(k)!),
  }));
}

export function computeContribution(
  adAgg: AggregatedInsight,
  totalAgg: AggregatedInsight,
  scope: Contribution["scope"],
): Contribution {
  const spendShare = div(adAgg.spend, totalAgg.spend);
  const purchaseContribution = div(adAgg.purchases, totalAgg.purchases);
  const revenueContribution = div(adAgg.purchaseValue, totalAgg.purchaseValue);

  // 비교 범위 전체 구매/매출이 0이면 계산 불가
  const canCalc = totalAgg.spend > 0;
  const ss = spendShare === null ? null : spendShare * 100;
  const pc = purchaseContribution === null ? null : purchaseContribution * 100;
  const rc = revenueContribution === null ? null : revenueContribution * 100;

  return {
    scope,
    spendShare: ss,
    purchaseContribution: pc,
    revenueContribution: rc,
    purchaseVsSpend: pc !== null && ss !== null ? pc - ss : null,
    revenueVsSpend: rc !== null && ss !== null ? rc - ss : null,
    canCalc,
  };
}

// 지표 그룹에서 특정 키 찾기 헬퍼
export function findMetric(groups: MetricGroup[], key: string): MetricResult | undefined {
  for (const g of groups) {
    const m = g.metrics.find((x) => x.key === key);
    if (m) return m;
  }
  return undefined;
}
