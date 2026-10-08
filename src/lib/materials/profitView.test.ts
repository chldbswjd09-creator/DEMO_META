import { describe, it, expect } from "vitest";
import { emptyAgg } from "@/lib/metrics/calc";
import type { AggregatedInsight } from "@/lib/types";
import type { MaterialAdRow, ProfitRecord } from "@/lib/materials/types";
import type { PerfField } from "@/lib/csv/columnMap";
import { computeMaterialProfit, computeOverallProfit, estRoasOf, metaRoasOf, elapsedDays } from "@/lib/materials/profitView";

function agg(p: Partial<AggregatedInsight>): AggregatedInsight {
  return { ...emptyAgg(), hasData: true, ...p };
}
function ad(key: string, name: string, a: Partial<AggregatedInsight>): MaterialAdRow {
  return { key, adId: key, accountName: "", campaignName: "", adSetName: "", adName: name, adSetKey: "", creativeType: "other", agg: agg(a) };
}

const PRESENT: PerfField[] = ["spend", "purchaseValue", "purchases"];
const ADS: MaterialAdRow[] = [
  ad("A", "0801_video", { spend: 50000, purchaseValue: 300000, purchases: 10 }),
  ad("B", "0801_image", { spend: 30000, purchaseValue: 120000, purchases: 4 }),
];

describe("computeMaterialProfit — 추정 ROAS(CSV) vs 입력 BEP ROAS", () => {
  it("BEP ROAS 입력 시 판정/차이 계산", () => {
    const rec: ProfitRecord = { id: "m", bepRoas: 220 };
    const r = computeMaterialProfit(ADS, PRESENT, rec);
    expect(r.bepRoas).toBe(220);

    const a = r.byKey.get("A")!;
    expect(a.estimatedRoas).toBeCloseTo(600, 3); // 300000/50000*100
    expect(a.bepRoas).toBe(220);
    expect(a.diffPp).toBeCloseTo(380, 3);
    expect(a.verdict).toBe("BEP 초과");

    const b = r.byKey.get("B")!;
    expect(b.estimatedRoas).toBeCloseTo(400, 3);
    expect(b.diffPp).toBeCloseTo(180, 3);
  });

  it("BEP ROAS 미입력 → 판정 'BEP ROAS 입력 필요', 추정 ROAS는 그대로", () => {
    const r = computeMaterialProfit(ADS, PRESENT, { id: "m", bepRoas: null });
    const a = r.byKey.get("A")!;
    expect(a.estimatedRoas).toBeCloseTo(600, 3);
    expect(a.bepRoas).toBeNull();
    expect(a.diffPp).toBeNull();
    expect(a.verdict).toBe("BEP ROAS 입력 필요");
  });

  it("구매 매출 없으면 추정 ROAS 계산 불가", () => {
    const r = computeMaterialProfit([ad("C", "no_rev", { spend: 10000 })], PRESENT, { id: "m", bepRoas: 200 });
    const c = r.byKey.get("C")!;
    expect(c.estimatedRoas).toBeNull();
    expect(c.verdict).toBe("추정 ROAS 계산 불가");
  });

  it("computeOverallProfit — 자료 전체 추정 ROAS", () => {
    const total = agg({ spend: 80000, purchaseValue: 420000, purchases: 14 });
    const o = computeOverallProfit(total, PRESENT, { id: "m", bepRoas: 220 });
    expect(o.estimatedRoas).toBeCloseTo(525, 3);
    expect(o.diffPp).toBeCloseTo(305, 3);
    expect(o.verdict).toBe("BEP 초과");
  });
});

describe("estRoasOf / metaRoasOf / elapsedDays", () => {
  it("추정 ROAS = 구매매출/광고비", () => {
    expect(estRoasOf(agg({ spend: 50000, purchaseValue: 300000 }), ["spend", "purchaseValue"])).toBeCloseTo(600, 3);
  });
  it("구매매출 없고 구매 ROAS 역산금액 있으면 그 값 사용", () => {
    expect(estRoasOf(agg({ spend: 50000, metaRevenueEst: 100000 }), ["spend", "purchaseRoas"])).toBeCloseTo(200, 3);
  });
  it("광고비 0 → null", () => {
    expect(estRoasOf(agg({ spend: 0, purchaseValue: 100 }), ["spend", "purchaseValue"])).toBeNull();
  });
  it("Meta ROAS 참고값", () => {
    expect(metaRoasOf(agg({ spend: 50000, purchaseValue: 300000 }), ["spend", "purchaseValue"])).toBeCloseTo(600, 3);
  });
  it("집행 경과일", () => {
    expect(elapsedDays("2026-08-01", "2026-08-07")).toBe(7);
    expect(elapsedDays(undefined, "2026-08-07")).toBeNull();
  });
});
