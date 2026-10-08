// 통합 소재 상세 — 퍼널 단계별 성과 분석 + 판단 보조.
// 선택한 통합 광고들(merged)의 '중앙값'과 상대 비교한다. 임의의 고정 절대 기준은 만들지 않는다.
// 앞단(집행량→소재관심→랜딩→구매→수익성) 순서로 확인 후보를 판단한다.

import type { AggregatedInsight, MetricGroup } from "@/lib/types";
import type { PerfField } from "@/lib/csv/columnMap";
import { findMetric } from "@/lib/metrics/calc";
import { formatKRW, formatNumber, formatMetricValue } from "@/lib/metrics/format";
import { integratedVerdict } from "@/lib/materials/integrate";

export interface MergedLike {
  mergeKey: string;
  adName: string;
  agg: AggregatedInsight;
  groups: MetricGroup[];
  present: PerfField[];
  periods: { start: string; end: string }[];
  estimatedRoas: number | null;
}

export type Rel = "낮음" | "높음" | "양호" | "비교 기준 부족" | null;

export interface StageRow {
  label: string;
  display: string;
  median?: string; // 선택 소재 중앙값
  rel?: Rel;
}
export interface Stage {
  key: string;
  title: string;
  rows: StageRow[];
}
export interface StageAnalysisResult {
  stages: Stage[];
  advisory: string;
  dataStart: string | null;
  dataEnd: string | null;
  dataDays: number | null;
  nameStart: string | null;
  elapsed: number | null;
}

// ── 값 추출 ──────────────────────────────────────────────────
function metricValue(mg: MergedLike, key: string): number | null {
  const m = findMetric(mg.groups, key);
  return m && m.state === "ok" && m.current != null ? m.current : null;
}
function metricDisplay(mg: MergedLike, key: string): string {
  const m = findMetric(mg.groups, key);
  return m ? formatMetricValue(m) : "-";
}
function rawValue(mg: MergedLike, field: PerfField): number | null {
  if (!mg.present.includes(field)) return null;
  return (mg.agg as unknown as Record<string, number>)[field] ?? 0;
}

function median(vals: number[]): number | null {
  if (vals.length === 0) return null;
  const s = [...vals].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ── 날짜 ─────────────────────────────────────────────────────
function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return start ? [start] : out;
  for (let t = s; t <= e; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
function distinctDays(periods: { start: string; end: string }[]): number {
  const set = new Set<string>();
  for (const p of periods) if (p.start && p.end) for (const d of eachDate(p.start, p.end)) set.add(d);
  return set.size;
}
function rangeOf(periods: { start: string; end: string }[]): { start: string; end: string } | null {
  const starts = periods.map((p) => p.start).filter(Boolean).sort();
  const ends = periods.map((p) => p.end).filter(Boolean).sort();
  if (!starts.length || !ends.length) return null;
  return { start: starts[0], end: ends[ends.length - 1] };
}
function daysBetween(start: string, end: string): number | null {
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  return Math.floor((e - s) / 86_400_000) + 1;
}
function nameStartOf(name: string, dataStart: string | null): string | null {
  const m = name.match(/(\d{2})(\d{2})/);
  if (!m) return null;
  const mm = Number(m[1]);
  const dd = Number(m[2]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const year = dataStart ? dataStart.slice(0, 4) : null;
  return year ? `${year}-${m[1]}-${m[2]}` : null;
}
function fmtDate(iso: string | null): string {
  return iso ? iso.replace(/-/g, ".") : "-";
}

const MIN_SAMPLE = 3; // 중앙값 비교에 필요한 최소 표본 광고 수

// higherBetter=true: 값이 클수록 좋음(노출/CTR/도달률/CVR). false: 작을수록 좋음(CPC/CPA/조회당 비용).
function relOf(current: number | null, med: number | null, sample: number, higherBetter: boolean): Rel {
  if (current == null) return null;
  if (sample < MIN_SAMPLE || med == null) return "비교 기준 부족";
  if (higherBetter) return current >= med ? "양호" : "낮음";
  return current <= med ? "양호" : "높음";
}

// ── 메인 ─────────────────────────────────────────────────────
export function analyzeStages(
  selected: MergedLike,
  all: MergedLike[],
  bepRoas: number | null,
): StageAnalysisResult {
  const rng = rangeOf(selected.periods);
  const dataStart = rng?.start ?? null;
  const dataEnd = rng?.end ?? null;
  const dataDays = selected.periods.length ? distinctDays(selected.periods) : null;
  const elapsed = dataStart && dataEnd ? daysBetween(dataStart, dataEnd) : null;
  const nameStart = nameStartOf(selected.adName, dataStart);

  // 중앙값 (선택 소재 전체)
  const medRaw = (field: PerfField) => median(all.map((a) => rawValue(a, field)).filter((v): v is number => v != null));
  const medMet = (key: string) => median(all.map((a) => metricValue(a, key)).filter((v): v is number => v != null));
  const sampleRaw = (field: PerfField) => all.filter((a) => rawValue(a, field) != null).length;
  const sampleMet = (key: string) => all.filter((a) => metricValue(a, key) != null).length;

  const rawRow = (field: PerfField, label: string, higherBetter: boolean, withRel: boolean): StageRow => {
    const v = rawValue(selected, field);
    if (v == null) return { label, display: "원본 열 없음" };
    const row: StageRow = { label, display: formatNumber(v) };
    if (withRel) {
      const med = medRaw(field);
      row.median = med == null ? "-" : formatNumber(med);
      row.rel = relOf(v, med, sampleRaw(field), higherBetter);
    }
    return row;
  };
  const metRow = (key: string, label: string, higherBetter: boolean, withRel: boolean): StageRow => {
    const mr = findMetric(selected.groups, key);
    const row: StageRow = { label, display: mr ? formatMetricValue(mr) : "-" };
    if (withRel && mr) {
      const v = mr.state === "ok" && mr.current != null ? mr.current : null;
      const med = medMet(key);
      row.median = med == null ? "-" : formatMetricValue({ ...mr, current: med });
      row.rel = relOf(v, med, sampleMet(key), higherBetter);
    }
    return row;
  };

  // 상대 평가 (판단 보조용)
  const relImpr = relOf(rawValue(selected, "impressions"), medRaw("impressions"), sampleRaw("impressions"), true);
  const relCtr = relOf(metricValue(selected, "ctr"), medMet("ctr"), sampleMet("ctr"), true);
  const relLanding = relOf(metricValue(selected, "landingRate"), medMet("landingRate"), sampleMet("landingRate"), true);
  const relCvr = relOf(metricValue(selected, "purchaseRate"), medMet("purchaseRate"), sampleMet("purchaseRate"), true);

  const spendDisplay = selected.present.includes("spend") ? formatKRW(selected.agg.spend) : "원본 열 없음";

  const stages: Stage[] = [
    {
      key: "volume",
      title: "① 집행량",
      rows: [
        { label: "광고비", display: spendDisplay },
        rawRow("impressions", "노출", true, true),
        { label: "CPM", display: metricDisplay(selected, "cpm") }, // 노출 비용(보조) — 광고비/노출과 함께 집행량 확인용
        rawRow("reach", "도달", true, false),
        { label: "빈도", display: metricDisplay(selected, "frequency") },
        rawRow("linkClicks", "링크 클릭", true, true),
        rawRow("purchases", "구매", true, false),
        { label: "데이터 포함일", display: dataDays != null ? `${dataDays}일` : "-" },
        { label: "집행 경과일", display: elapsed != null ? `${elapsed}일` : "-" },
      ],
    },
    {
      key: "interest",
      title: "② 소재 관심",
      rows: [
        rawRow("impressions", "노출", true, false),
        rawRow("linkClicks", "링크 클릭", true, false),
        metRow("ctr", "CTR", true, true),
        metRow("cpc", "CPC", false, true),
      ],
    },
    {
      key: "landing",
      title: "③ 랜딩 도달",
      rows: [
        rawRow("linkClicks", "링크 클릭", true, false),
        rawRow("landingPageViews", "랜딩페이지 조회(LPV)", true, false),
        metRow("landingRate", "랜딩 도달률", true, true),
        metRow("landingCost", "LPV당 비용", false, true),
      ],
    },
    {
      key: "purchase",
      title: "④ 구매 전환",
      rows: [
        rawRow("landingPageViews", "랜딩페이지 조회(LPV)", true, false),
        rawRow("purchases", "구매", true, false),
        metRow("purchaseRate", "구매전환율(CVR)", true, true),
        metRow("cpa", "CPA", false, true),
      ],
    },
    {
      key: "profit",
      title: "⑤ 수익성",
      rows: [
        { label: "광고비", display: spendDisplay },
        rawRow("purchases", "구매", true, false),
        { label: "CPA", display: metricDisplay(selected, "cpa") },
        { label: "ROAS", display: selected.estimatedRoas == null ? "계산 불가" : `${selected.estimatedRoas.toFixed(1)}%` },
        { label: "BEP ROAS", display: bepRoas == null ? "미입력" : `${bepRoas.toFixed(1)}%` },
        {
          label: "BEP 대비",
          display:
            selected.estimatedRoas == null || bepRoas == null
              ? "-"
              : `${Math.round(selected.estimatedRoas * 10) / 10 - bepRoas >= 0 ? "+" : ""}${(Math.round(selected.estimatedRoas * 10) / 10 - bepRoas).toFixed(1)}%p`,
        },
      ],
    },
  ];

  // 판단 보조 (앞단부터)
  const vCode = integratedVerdict(selected.estimatedRoas, bepRoas);
  let advisory: string;
  if (vCode === "monitor") {
    advisory =
      selected.estimatedRoas == null
        ? "ROAS를 계산할 수 없어 수익성 판단이 어렵습니다. 구매 매출 데이터 확인이 필요합니다."
        : "BEP ROAS가 입력되지 않아 판정할 수 없습니다. BEP ROAS를 입력하면 판단할 수 있습니다.";
  } else if (vCode === "keep") {
    advisory = "수익성 기준(ROAS ≥ BEP ROAS)을 충족하고 있습니다.";
  } else if (relImpr === "낮음") {
    advisory = "현재 집행량이 적어 성과 확정 시 주의가 필요합니다.";
  } else if (relCtr === "낮음") {
    advisory = "노출은 확보됐으나 클릭 반응이 상대적으로 낮아 소재 후킹·메시지 확인이 필요합니다.";
  } else if (relLanding === "낮음") {
    advisory = "클릭은 확보됐으나 랜딩 도달이 상대적으로 낮아 랜딩 도달 단계 확인이 필요합니다.";
  } else if (relCvr === "낮음") {
    advisory = "클릭 반응은 양호하지만 구매전환율이 낮아 랜딩·구매 전환 단계 확인이 필요합니다.";
  } else {
    advisory = "클릭·구매 데이터가 충분히 확보된 상태에서도 ROAS가 BEP ROAS를 하회하고 있습니다.";
  }

  return { stages, advisory, dataStart: fmtDate(dataStart) === "-" ? null : dataStart, dataEnd, dataDays, nameStart, elapsed };
}
