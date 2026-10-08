import { describe, it, expect } from "vitest";
import { computeDropoff } from "@/lib/materials/videoDropoff";
import { emptyAgg } from "@/lib/metrics/calc";
import type { AggregatedInsight } from "@/lib/types";
import type { PerfField } from "@/lib/csv/columnMap";

function agg(p: Partial<AggregatedInsight>): AggregatedInsight {
  return { ...emptyAgg(), hasData: true, ...p };
}
const ALL_VIDEO: PerfField[] = ["video3s", "video25", "video50", "video75", "video95", "video100"];

describe("영상 구간별 이탈", () => {
  it("모든 구간 존재: 이탈률 + 최대 이탈 구간", () => {
    // 3s 1000 → 25% 700 → 50% 400 → 75% 300 → 95% 270 → 100% 256.5(정수 아님 방지 위해 조정)
    const a = agg({ video3s: 1000, video25: 700, video50: 400, video75: 300, video95: 270, video100: 256 });
    const r = computeDropoff(a, ALL_VIDEO, true);
    expect(r.applicable).toBe(true);
    expect(r.hasData).toBe(true);
    const seg = (label: string) => r.segments.find((s) => s.label === label)!;
    expect(r.segments.find((s) => s.label === "3초 → 25%")).toBeUndefined(); // 3초→25% 제외
    expect(seg("25% → 50%").dropRate).toBeCloseTo(42.857, 2); // (700-400)/700
    expect(seg("50% → 75%").dropRate).toBeCloseTo(25, 6);
    // 최대 이탈 = 25% → 50% (42.9%)
    expect(r.maxLabel).toBe("25% → 50%");
    expect(seg("25% → 50%").isMax).toBe(true);
    expect(r.advice).toContain("전반~중반");
  });

  it("일부 구간 열만 존재하면 그 구간만 계산", () => {
    const present: PerfField[] = ["video3s", "video50", "video100"]; // 25/75/95 없음
    const a = agg({ video3s: 1000, video50: 500, video100: 200 });
    const r = computeDropoff(a, present, true);
    // 3초→25% 계산 불가(25 없음), 25→50 불가, 50→75 불가(75 없음), 75→95 불가, 95→100 불가
    expect(r.segments.every((s) => !s.computable)).toBe(true);
    expect(r.hasData).toBe(false);
  });

  it("분모 0 → 계산 불가", () => {
    const a = agg({ video3s: 0, video25: 0, video50: 0, video75: 0, video95: 0, video100: 0 });
    const r = computeDropoff(a, ALL_VIDEO, true);
    expect(r.hasData).toBe(false);
  });

  it("이미지 광고 → 적용 대상 아님", () => {
    const r = computeDropoff(agg({ video3s: 100 }), ALL_VIDEO, false);
    expect(r.applicable).toBe(false);
  });
});
