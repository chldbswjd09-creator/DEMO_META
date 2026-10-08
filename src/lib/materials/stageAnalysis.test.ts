import { describe, it, expect } from "vitest";
import { emptyAgg } from "@/lib/metrics/calc";
import { metricGroupsForAgg } from "@/lib/materials/compute";
import type { AggregatedInsight } from "@/lib/types";
import type { PerfField } from "@/lib/csv/columnMap";
import { analyzeStages, type MergedLike } from "@/lib/materials/stageAnalysis";

const PRESENT: PerfField[] = ["spend", "impressions", "reach", "linkClicks", "landingPageViews", "purchases", "purchaseValue"];

function ad(name: string, v: { imp: number; clk: number; spend: number; pv: number; purch: number; lpv: number }, periods: { start: string; end: string }[]): MergedLike {
  const agg: AggregatedInsight = { ...emptyAgg(), hasData: true, spend: v.spend, impressions: v.imp, reach: Math.round(v.imp * 0.8), linkClicks: v.clk, landingPageViews: v.lpv, purchases: v.purch, purchaseValue: v.pv };
  return { mergeKey: name, adName: name, agg, groups: metricGroupsForAgg(agg, PRESENT), present: PRESENT, periods, estimatedRoas: v.spend > 0 && v.pv > 0 ? (v.pv / v.spend) * 100 : null };
}

// A: 집행량 충분(노출 중앙값 이상)인데 CTR만 상대적으로 낮음 + ROAS<BEP
const A = ad("0731_video_1", { imp: 18000, clk: 180, spend: 50000, pv: 50000, purch: 5, lpv: 100 }, [
  { start: "2026-07-31", end: "2026-07-31" }, { start: "2026-08-01", end: "2026-08-01" }, { start: "2026-08-02", end: "2026-08-02" },
]);
const B = ad("0801_image_1", { imp: 20000, clk: 400, spend: 40000, pv: 120000, purch: 10, lpv: 200 }, [{ start: "2026-08-01", end: "2026-08-01" }]);
const C = ad("0802_image_2", { imp: 15000, clk: 330, spend: 30000, pv: 90000, purch: 8, lpv: 180 }, [{ start: "2026-08-02", end: "2026-08-02" }]);

describe("analyzeStages — 퍼널 단계별 + 판단 보조", () => {
  const r = analyzeStages(A, [A, B, C], 220);

  it("소재명 기준 시작일 / 실제 데이터 포함 기간 / 데이터 포함일", () => {
    expect(r.nameStart).toBe("2026-07-31");
    expect(r.dataStart).toBe("2026-07-31");
    expect(r.dataEnd).toBe("2026-08-02");
    expect(r.dataDays).toBe(3); // 07-31, 08-01, 08-02
    expect(r.elapsed).toBe(3);
  });

  it("CTR이 중앙값보다 낮으면 rel '낮음'", () => {
    const interest = r.stages.find((s) => s.key === "interest")!;
    const ctr = interest.rows.find((x) => x.label === "CTR")!;
    expect(ctr.rel).toBe("낮음"); // A CTR 1.0% < median 2.0%
  });

  it("집행량 충분 + CTR 낮음 + ROAS<BEP → 판단 보조는 소재 관심 단계 안내", () => {
    expect(r.advisory).toContain("클릭 반응");
  });

  it("ROAS>=BEP면 판단 보조는 수익성 충족 안내", () => {
    const keep = analyzeStages(B, [A, B, C], 220); // B ROAS 300% >= 220
    expect(keep.advisory).toContain("충족");
  });

  it("비교 대상 부족(1개)이면 '비교 기준 부족'", () => {
    const solo = analyzeStages(A, [A], 220);
    const interest = solo.stages.find((s) => s.key === "interest")!;
    const ctr = interest.rows.find((x) => x.label === "CTR")!;
    expect(ctr.rel).toBe("비교 기준 부족");
  });
});
