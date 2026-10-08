// 영상 구간별 이탈 분석 — 이전 구간 재생 대비 다음 구간 미도달 비율.
// 열이 없는 구간은 0이 아니라 '계산 불가'로 처리한다.

import type { AggregatedInsight } from "@/lib/types";
import type { PerfField } from "@/lib/csv/columnMap";

type VideoField = "video3s" | "video25" | "video50" | "video75" | "video95" | "video100";

export interface SegmentResult {
  label: string;
  dropRate: number | null;
  computable: boolean;
  isMax: boolean;
}
export interface DropoffResult {
  applicable: boolean; // 영상 광고 여부
  hasData: boolean; // 계산 가능한 구간 존재 여부
  segments: SegmentResult[];
  maxLabel: string | null;
  advice: string | null;
}

// 3초 재생과 25% 재생은 영상 길이에 따라 시간 순서가 달라질 수 있어 이탈 구간에서 제외한다.
// (3초 재생은 별도 '후킹률'로 유지) 구간 이탈은 25% 이후부터 계산한다.
const SEGMENTS: { label: string; fromField: VideoField; toField: VideoField }[] = [
  { label: "25% → 50%", fromField: "video25", toField: "video50" },
  { label: "50% → 75%", fromField: "video50", toField: "video75" },
  { label: "75% → 95%", fromField: "video75", toField: "video95" },
  { label: "95% → 100%", fromField: "video95", toField: "video100" },
];

function adviceFor(label: string): string {
  if (label === "25% → 50%") return "영상 전반~중반 이탈이 가장 큽니다. 메시지 전개와 템포를 점검해주세요.";
  if (label === "50% → 75%") return "영상 중반 이후 이탈이 가장 큽니다. 핵심 소구점 전달 시점을 점검해주세요.";
  return "영상 후반 이탈이 가장 큽니다. CTA 및 마무리 구간의 길이와 구성을 점검해주세요.";
}

export function computeDropoff(agg: AggregatedInsight, present: PerfField[], isVideo: boolean): DropoffResult {
  if (!isVideo) return { applicable: false, hasData: false, segments: [], maxLabel: null, advice: null };
  const has = new Set(present);
  const segments: SegmentResult[] = SEGMENTS.map((s) => {
    const both = has.has(s.fromField) && has.has(s.toField);
    const fromV = agg[s.fromField] as number;
    const toV = agg[s.toField] as number;
    const computable = both && fromV > 0;
    const dropRate = computable ? ((fromV - toV) / fromV) * 100 : null;
    return { label: s.label, dropRate, computable, isMax: false };
  });

  const computables = segments.filter((s) => s.computable && s.dropRate !== null);
  const hasData = computables.length > 0;
  let maxLabel: string | null = null;
  let advice: string | null = null;
  if (hasData) {
    const max = computables.reduce((a, b) => (b.dropRate! > a.dropRate! ? b : a));
    max.isMax = true;
    maxLabel = max.label;
    advice = adviceFor(max.label);
  }
  return { applicable: true, hasData, segments, maxLabel, advice };
}
