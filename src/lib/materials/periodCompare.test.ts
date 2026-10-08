import { describe, it, expect } from "vitest";
import { emptyAgg } from "@/lib/metrics/calc";
import { emptyMapping } from "@/lib/csv/mapping";
import { DEFAULT_SETTINGS } from "@/lib/verdict/settings";
import type { AggregatedInsight, CreativeType } from "@/lib/types";
import type { PerfField } from "@/lib/csv/columnMap";
import type { Material, MaterialAdRow, MaterialAnalysis } from "@/lib/materials/types";
import {
  computeGroup, comparePeriods, groupDataDays, materialDates,
  overallRows, compareStatusOf, adMetricsOf, dailyActiveCreatives, purchaseSampleWeak,
  type AdMetrics,
} from "@/lib/materials/periodCompare";

const FULL: PerfField[] = ["spend", "impressions", "reach", "linkClicks", "landingPageViews", "purchases", "purchaseValue"];

function agg(p: Partial<AggregatedInsight>): AggregatedInsight {
  // 실제 구매 열에서 온 데이터로 취급(effectivePresent가 purchases를 유지하도록)
  return { ...emptyAgg(), hasData: true, purchasesSource: "direct_purchase_column", ...p };
}
function adRow(adId: string | undefined, adName: string, a: Partial<AggregatedInsight>, ct: CreativeType = "image"): MaterialAdRow {
  return { key: adId ?? adName, adId, accountName: "acc", campaignName: "c", adSetName: "s", adName, adSetKey: "s", creativeType: ct, agg: agg(a) };
}
function analysis(id: string, ads: MaterialAdRow[], present: PerfField[], start: string, end: string): MaterialAnalysis {
  let total = emptyAgg();
  for (const ad of ads) for (const k of ["spend", "impressions", "reach", "linkClicks", "landingPageViews", "purchases", "purchaseValue"] as const) total[k] += ad.agg[k];
  total.hasData = true;
  return { id, name: id, tags: [], periodStart: start, periodEnd: end, present, total, ads, adCount: ads.length, verdict: { code: "monitor", confidence: "낮음", dataSufficiency: "제한적", reasons: [], action: "" }, warnings: [] };
}
const S = DEFAULT_SETTINGS;
function row(rows: CompareRowLike[], key: string) { return rows.find((r) => r.key === key)!; }
type CompareRowLike = ReturnType<typeof overallRows>[number];

describe("실제 데이터 포함일 (unique dates)", () => {
  function mat(dates: string[]): Material {
    const m = emptyMapping();
    m.date = { header: "Day", confidence: 1, auto: true };
    return { id: "x", name: "x", tags: [], memo: "", createdAt: "", file: { name: "f", size: 0, encoding: "utf-8", delimiter: "," }, headers: ["Day"], rows: dates.map((d) => ({ Day: d })), mapping: m };
  }
  it("겹치는 날짜는 한 번만, 없는 날짜는 생성 안 함", () => {
    // 8/1,8/2,8/4 → 3일 (8/3 없음)
    expect(materialDates(mat(["2026-08-01", "2026-08-02", "2026-08-04"])).sort()).toEqual(["2026-08-01", "2026-08-02", "2026-08-04"]);
    // CSV A 8/1~8/3 + CSV B 8/3~8/5 → 5일 (6일 아님)
    expect(groupDataDays([mat(["2026-08-01", "2026-08-02", "2026-08-03"]), mat(["2026-08-03", "2026-08-04", "2026-08-05"])])).toBe(5);
  });
  it("일자 열이 없으면 보고 기간 달력 범위로 분모 계산", () => {
    const m = emptyMapping();
    const material: Material = { id: "y", name: "y", tags: [], memo: "", createdAt: "", file: { name: "f", size: 0, encoding: "utf-8", delimiter: "," }, headers: [], rows: [{}], mapping: m, periodStart: "2026-08-01", periodEnd: "2026-08-10" };
    expect(materialDates(material).length).toBe(10);
  });
});

describe("CASE 1: A=10일 B=2일 — 일평균 비교 / 비율은 통합값", () => {
  const A = computeGroup("변경 전", [analysis("A1", [adRow("1", "0731_video_1", { spend: 1_000_000, impressions: 35_000, linkClicks: 800, landingPageViews: 700, purchases: 50, purchaseValue: 3_000_000 }, "video")], FULL, "2026-07-31", "2026-08-09")], 10, S);
  const B = computeGroup("변경 후", [analysis("B1", [adRow("1", "0731_video_1", { spend: 300_000, impressions: 8_400, linkClicks: 220, landingPageViews: 200, purchases: 16, purchaseValue: 1_000_000 }, "video")], FULL, "2026-08-10", "2026-08-11")], 2, S);
  const rows = overallRows(A, B);
  it("raw volume은 일평균으로 환산", () => {
    expect(row(rows, "dataDays").a).toBe(10);
    expect(row(rows, "dataDays").b).toBe(2);
    expect(row(rows, "spend").a).toBeCloseTo(100_000, 0); // 1,000,000/10
    expect(row(rows, "spend").b).toBeCloseTo(150_000, 0); // 300,000/2
    expect(row(rows, "spend").aTotal).toBe(1_000_000); // 누적값 보조
    expect(row(rows, "purchase").a).toBeCloseTo(5, 3);
    expect(row(rows, "purchase").b).toBeCloseTo(8, 3);
  });
  it("ROAS/CTR 등 비율은 일평균으로 나누지 않고 통합값", () => {
    expect(row(rows, "roas").a).toBeCloseTo(300, 1); // 3,000,000/1,000,000
    expect(row(rows, "roas").b).toBeCloseTo(333.33, 1); // 1,000,000/300,000
    expect(row(rows, "roas").changeKind).toBe("pp");
    expect(row(rows, "spend").changeKind).toBe("pct");
  });
  it("CPM은 총 광고비/총 노출×1000 (일평균 아님), %로 비교", () => {
    expect(row(rows, "cpm").a).toBeCloseTo((1_000_000 / 35_000) * 1000, 0); // ≈28,571
    expect(row(rows, "cpm").b).toBeCloseTo((300_000 / 8_400) * 1000, 0); // ≈35,714
    expect(row(rows, "cpm").changeKind).toBe("pct");
  });
});

describe("동일 소재 매칭 / 구성 분류 (CASE 2~6)", () => {
  it("CASE 2·3·4: 공통=동일소재, A만=제외, B만=신규", () => {
    const A = computeGroup("A", [analysis("A", [adRow("1", "0801_video_1", { spend: 100, impressions: 2000, purchases: 3, purchaseValue: 400 }), adRow("2", "0801_video_2", { spend: 100, impressions: 2000 })], FULL, "2026-08-01", "2026-08-01")], 1, S);
    const B = computeGroup("B", [analysis("B", [adRow("1", "0801_video_1", { spend: 200, impressions: 3000, purchases: 5, purchaseValue: 900 }), adRow("3", "0810_video_9", { spend: 150, impressions: 2500 })], FULL, "2026-08-10", "2026-08-11")], 2, S);
    const r = comparePeriods(A, B);
    expect(r.sameAds.map((s) => s.mergeKey)).toEqual(["id:1"]);
    expect(r.excluded.map((m) => m.mergeKey)).toEqual(["id:2"]);
    expect(r.newAds.map((m) => m.mergeKey)).toEqual(["id:3"]);
  });
  it("CASE 5: 이름 같고 광고 ID 다르면 다른 광고", () => {
    const A = computeGroup("A", [analysis("A", [adRow("11", "same_image_1", { spend: 100, impressions: 2000 })], FULL, "2026-08-01", "2026-08-01")], 1, S);
    const B = computeGroup("B", [analysis("B", [adRow("22", "same_image_1", { spend: 100, impressions: 2000 })], FULL, "2026-08-02", "2026-08-02")], 1, S);
    const r = comparePeriods(A, B);
    expect(r.sameAds.length).toBe(0);
    expect(r.excluded[0].mergeKey).toBe("id:11");
    expect(r.newAds[0].mergeKey).toBe("id:22");
  });
  it("CASE 6: 광고 ID 없으면 정규화 이름으로 매칭", () => {
    const A = computeGroup("A", [analysis("A", [adRow(undefined, "noid_image_1", { spend: 100, impressions: 2000 })], FULL, "2026-08-01", "2026-08-01")], 1, S);
    const B = computeGroup("B", [analysis("B", [adRow(undefined, "noid_image_1", { spend: 150, impressions: 3000 })], FULL, "2026-08-02", "2026-08-02")], 1, S);
    const r = comparePeriods(A, B);
    expect(r.sameAds.map((s) => s.mergeKey)).toEqual(["nm:noid_image_1"]);
  });
});

describe("자동 요약 / 데이터 부족 (CASE 7~9)", () => {
  it("CASE 7: B 2일 → 초기 변화(E)", () => {
    const A = computeGroup("A", [analysis("A", [adRow("1", "a_image_1", { spend: 1000, impressions: 5000, purchases: 5, purchaseValue: 3000 })], FULL, "2026-08-01", "2026-08-05")], 5, S);
    const B = computeGroup("B", [analysis("B", [adRow("1", "a_image_1", { spend: 400, impressions: 4000, purchases: 4, purchaseValue: 2500 })], FULL, "2026-08-10", "2026-08-11")], 2, S);
    const r = comparePeriods(A, B);
    expect(r.summary.caseId).toBe("E");
    expect(r.summary.bDataShort).toBe(true);
  });
  it("CASE 8: 전체 ROAS↑ + 동일 소재 ~동일 + 제외 소재 저성과 → 구성 변화(A)", () => {
    const A = computeGroup("A", [analysis("A", [
      adRow("1", "keep_image_1", { spend: 100_000, impressions: 40_000, linkClicks: 900, landingPageViews: 800, purchases: 40, purchaseValue: 300_000 }),
      adRow("9", "low_image_9", { spend: 100_000, impressions: 40_000, linkClicks: 700, landingPageViews: 600, purchases: 10, purchaseValue: 90_000 }),
    ], FULL, "2026-08-01", "2026-08-05")], 5, S);
    const B = computeGroup("B", [analysis("B", [
      adRow("1", "keep_image_1", { spend: 100_000, impressions: 40_000, linkClicks: 900, landingPageViews: 800, purchases: 40, purchaseValue: 305_000 }),
    ], FULL, "2026-08-06", "2026-08-10")], 5, S);
    const r = comparePeriods(A, B);
    expect(r.excluded.map((m) => m.mergeKey)).toEqual(["id:9"]);
    expect(["A", "C"]).toContain(r.summary.caseId); // 구성 변화 영향 계열
    expect(r.summary.overallImproved).toBe(true);
  });
  it("CASE 9: 전체 ROAS↑ + 동일 소재도 ↑ → 구성+소재 개선(B)", () => {
    const A = computeGroup("A", [analysis("A", [adRow("1", "keep_image_1", { spend: 100_000, impressions: 40_000, linkClicks: 900, landingPageViews: 800, purchases: 30, purchaseValue: 250_000 })], FULL, "2026-08-01", "2026-08-05")], 5, S);
    const B = computeGroup("B", [analysis("B", [adRow("1", "keep_image_1", { spend: 100_000, impressions: 42_000, linkClicks: 1000, landingPageViews: 900, purchases: 45, purchaseValue: 450_000 })], FULL, "2026-08-06", "2026-08-10")], 5, S);
    const r = comparePeriods(A, B);
    expect(r.summary.caseId).toBe("B");
    expect(r.summary.sameAdImproved).toBe(true);
  });
});

describe("CASE 10: 원본 열 누락 — 임의 전체 지표 생성 금지", () => {
  it("그룹 내 한 자료라도 구매매출 열이 없으면 통합 ROAS 계산 불가", () => {
    const noVal = FULL.filter((f) => f !== "purchaseValue");
    const A = computeGroup("A", [
      analysis("A1", [adRow("1", "a_image_1", { spend: 500, impressions: 3000, purchases: 3, purchaseValue: 2000 })], FULL, "2026-08-01", "2026-08-05"),
      analysis("A2", [adRow("2", "a_image_2", { spend: 500, impressions: 3000, purchases: 3 })], noVal, "2026-08-06", "2026-08-10"),
    ], 10, S);
    expect(A.present.includes("purchaseValue")).toBe(false);
    expect(A.roas).toBeNull(); // 5일치 매출로 10일 ROAS 만들지 않음
    const rows = overallRows(A, A);
    expect(row(rows, "roas").a).toBeNull();
    expect(row(rows, "revenue").a).toBeNull(); // 일평균 구매매출도 계산 불가
  });
});

describe("보완: 일평균 집행 소재 수 (착시 방지)", () => {
  function matDaily(rows: Record<string, string>[]): Material {
    const m = emptyMapping();
    m.date = { header: "일자", confidence: 1, auto: true };
    m.spend = { header: "지출", confidence: 1, auto: true };
    m.adName = { header: "광고명", confidence: 1, auto: true };
    return { id: "m", name: "m", tags: [], memo: "", createdAt: "", file: { name: "f", size: 0, encoding: "utf-8", delimiter: "," }, headers: ["일자", "광고명", "지출"], rows, mapping: m };
  }
  it("CASE 1: 각 날짜 실제 집행(광고비>0) 소재 수의 평균 (고유수/일수 아님, 광고비 0 제외)", () => {
    // 8/1: A,B 집행 (C는 지출0) = 2 · 8/2: A,D = 2 → 총 4, dataDays 2 → 2.0
    const mats = [matDaily([
      { 일자: "2026-08-01", 광고명: "A", 지출: "100" },
      { 일자: "2026-08-01", 광고명: "B", 지출: "50" },
      { 일자: "2026-08-01", 광고명: "C", 지출: "0" },
      { 일자: "2026-08-02", 광고명: "A", 지출: "80" },
      { 일자: "2026-08-02", 광고명: "D", 지출: "10" },
    ])];
    expect(groupDataDays(mats)).toBe(2);
    expect(dailyActiveCreatives(mats, groupDataDays(mats))).toBeCloseTo(2.0, 5);
  });
  it("광고비 열이 없으면 계산 불가(null) — 임의 집행 추정 금지", () => {
    const m = emptyMapping();
    m.date = { header: "일자", confidence: 1, auto: true };
    m.adName = { header: "광고명", confidence: 1, auto: true };
    const mat: Material = { id: "m", name: "m", tags: [], memo: "", createdAt: "", file: { name: "f", size: 0, encoding: "utf-8", delimiter: "," }, headers: ["일자", "광고명"], rows: [{ 일자: "2026-08-01", 광고명: "A" }], mapping: m };
    expect(dailyActiveCreatives([mat], 1)).toBeNull();
  });
  it("computeGroup에 dailyActive가 실리고 overallRows에 '일평균 집행 소재 수' 행 추가", () => {
    const A = computeGroup("A", [analysis("A", [adRow("1", "a_image", { spend: 100, impressions: 2000 })], FULL, "2026-08-01", "2026-08-01")], 1, S, 20.4);
    const B = computeGroup("B", [analysis("B", [adRow("1", "a_image", { spend: 100, impressions: 2000 })], FULL, "2026-08-02", "2026-08-02")], 1, S, 21.7);
    const rows = overallRows(A, B);
    const r = rows.find((x) => x.key === "dailyActive")!;
    expect(r.a).toBeCloseTo(20.4, 5);
    expect(r.b).toBeCloseTo(21.7, 5);
    expect(r.changeKind).toBe("pct"); // 상대 증감(%)
  });
});

describe("보완: 구매 절대량 / 표본 / CVR 분모", () => {
  it("CASE 3·4: 일평균 구매 절대량과 총 구매(표본) 동시 확인", () => {
    // A 10일 총 구매 37 → 일평균 3.7 · B 3일 총 구매 13 → 일평균 4.33
    const a = adMetricsOf(agg({ spend: 100000, impressions: 40000, linkClicks: 800, landingPageViews: 700, purchases: 37, purchaseValue: 300000 }), FULL, 10);
    const b = adMetricsOf(agg({ spend: 30000, impressions: 12000, linkClicks: 240, landingPageViews: 210, purchases: 13, purchaseValue: 130000 }), FULL, 3);
    expect(a.dayAvgPurchase).toBeCloseTo(3.7, 3);
    expect(b.dayAvgPurchase).toBeCloseTo(4.333, 2);
    expect(a.purchaseTotal).toBe(37); // 표본 규모(성과 판단 아님)
    expect(b.purchaseTotal).toBe(13);
    expect(purchaseSampleWeak(a, b)).toBe(false); // 표본 충분
  });
  it("CASE 5: 구매 1~2건 → 표본 부족 플래그", () => {
    const a = adMetricsOf(agg({ spend: 5000, impressions: 5000, linkClicks: 100, landingPageViews: 10, purchases: 1, purchaseValue: 700 }), FULL, 5);
    const b = adMetricsOf(agg({ spend: 5000, impressions: 5000, linkClicks: 100, landingPageViews: 10, purchases: 2, purchaseValue: 1400 }), FULL, 5);
    expect(purchaseSampleWeak(a, b)).toBe(true); // 구매 ≤2
    expect(a.cvr).toBeCloseTo(10, 3); // 1/10*100 (기존 CVR 엔진과 동일 분자/분모)
    expect(b.cvr).toBeCloseTo(20, 3);
    expect(a.lpvTotal).toBe(10);
  });
  it("CASE 6: LPV 원본 열 없음 → CVR 계산 불가, 분모 임의 생성 금지", () => {
    const noLpv = FULL.filter((f) => f !== "landingPageViews");
    const a = adMetricsOf(agg({ spend: 5000, impressions: 5000, linkClicks: 100, purchases: 5, purchaseValue: 3000 }), noLpv, 5);
    expect(a.cvr).toBeNull();
    expect(a.lpvTotal).toBeNull();
  });
  it("CASE 12: 작은 구매 표본이면 CVR 신호 신뢰도 하향 (효율 개선 강제 안 함)", () => {
    // CTR·CVR만 개선, ROAS/CPA flat. 표본 충분이면 improved, 표본 부족이면 limited.
    const base: AdMetrics = { dataDays: 5, dayAvgSpend: 1, dayAvgImpr: 1, dayAvgClicks: 1, dayAvgLpv: 1, dayAvgPurchase: 1, dayAvgRevenue: 1, impressions: 5000, cpm: 200, ctr: 1, cpc: 100, landingRate: 50, cvr: 2, cpa: 1000, roas: 200, spendTotal: 1000, purchaseTotal: 10, lpvTotal: 100, linkClicksTotal: 100 };
    const aFull: AdMetrics = { ...base };
    const bFull: AdMetrics = { ...base, ctr: 2, cvr: 8 }; // CTR·CVR 개선, 나머지 동일
    expect(compareStatusOf(aFull, bFull, 5)).toBe("improved"); // 표본 충분(구매10/클릭100) → CVR 신호 유효
    const aWeak: AdMetrics = { ...base, purchaseTotal: 2 };
    const bWeak: AdMetrics = { ...base, ctr: 2, cvr: 8, purchaseTotal: 2 };
    expect(compareStatusOf(aWeak, bWeak, 5)).toBe("limited"); // 표본 부족 → CVR 신호 하향 → 강제 개선 안 함
  });
});

describe("동일 소재 변화 판정 (별도 상태)", () => {
  it("B 노출 부족/2일 → 비교 데이터 부족", () => {
    const a = adMetricsOf(agg({ spend: 1000, impressions: 5000, purchases: 5, purchaseValue: 3000 }), FULL, 5);
    const b = adMetricsOf(agg({ spend: 500, impressions: 800, purchases: 1, purchaseValue: 700 }), FULL, 2);
    expect(compareStatusOf(a, b, 2)).toBe("insufficient");
  });
  it("ROAS·CPA 동반 개선 → 효율 개선", () => {
    const a = adMetricsOf(agg({ spend: 100_000, impressions: 40_000, linkClicks: 800, landingPageViews: 700, purchases: 20, purchaseValue: 200_000 }), FULL, 5);
    const b = adMetricsOf(agg({ spend: 100_000, impressions: 40_000, linkClicks: 900, landingPageViews: 800, purchases: 35, purchaseValue: 400_000 }), FULL, 5);
    expect(compareStatusOf(a, b, 5)).toBe("improved");
  });
});
