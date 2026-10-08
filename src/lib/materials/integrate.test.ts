import { describe, it, expect } from "vitest";
import { parseCsvText } from "@/lib/csv/parse";
import { autoMap } from "@/lib/csv/mapping";
import { DEFAULT_SETTINGS } from "@/lib/verdict/settings";
import type { Material } from "@/lib/materials/types";
import { buildMaterialAnalysis, metricGroupsForAgg } from "@/lib/materials/compute";
import { integrate, integratedVerdict } from "@/lib/materials/integrate";
import { findMetric } from "@/lib/metrics/calc";

const HEADER = "광고 이름,광고 ID,지출 금액,노출,랜딩 페이지 조회,구매,구매 전환값";
function makeMaterial(id: string, name: string, start: string, end: string, body: string): Material {
  const text = `${HEADER}\n${body}`;
  const p = parseCsvText(text, { fileName: `${name}.csv`, fileSize: text.length });
  return {
    id, name, tags: [], memo: "", periodStart: start, periodEnd: end, createdAt: "2026-08-20T00:00:00.000Z",
    file: { name: p.fileName, size: p.fileSize, encoding: p.encoding, delimiter: p.delimiter },
    headers: p.headers, rows: p.rows, mapping: autoMap(p.headers),
  };
}

// 두 자료에 동일 광고 X(id1), 서로 다른 기간
const A = makeMaterial("a", "0801", "2026-08-01", "2026-08-07", `0803_video_01,1,30000,50000,800,3,90000
Y,2,20000,20000,500,2,60000`);
const B = makeMaterial("b", "0802", "2026-08-08", "2026-08-14", `0803_video_01,1,50000,60000,900,5,150000
Z,3,10000,15000,200,1,30000`);

const anA = buildMaterialAnalysis(A, DEFAULT_SETTINGS);
const anB = buildMaterialAnalysis(B, DEFAULT_SETTINGS);

describe("통합 분석 (BEP는 UI 공통 입력, 추정 ROAS는 CSV 합산)", () => {
  it("동일 광고 ID 통합: 광고비 합산 + 추정 ROAS 재계산", () => {
    const r = integrate([anA, anB], "exclude", DEFAULT_SETTINGS);
    const x = r.merged.find((m) => m.adId === "1")!;
    expect(x.spend).toBe(80000); // 30000 + 50000
    expect(x.estimatedRoas).toBeCloseTo(300, 3); // (90000+150000)/80000*100
  });

  it("총 광고비 / 통합 추정 ROAS", () => {
    const r = integrate([anA, anB], "exclude", DEFAULT_SETTINGS);
    expect(r.totalSpend).toBe(110000); // 80000 + 20000 + 10000
    expect(r.integratedEstimatedRoas).toBeCloseTo(300, 3); // 330000/110000*100
    expect(r.periodOverlap).toBe(false);
  });

  it("기간이 겹치면 periodOverlap 경고", () => {
    const C = makeMaterial("c", "0801b", "2026-08-05", "2026-08-10", `0803_video_01,1,10000,10000,100,1,30000`);
    const anC = buildMaterialAnalysis(C, DEFAULT_SETTINGS);
    const r = integrate([anA, anC], "exclude", DEFAULT_SETTINGS);
    expect(r.periodOverlap).toBe(true);
  });
});

describe("통합 판정 — ROAS vs 입력 BEP ROAS만 비교", () => {
  it("BEP 판정 규칙", () => {
    expect(integratedVerdict(300, 220)).toBe("keep"); // 유지
    expect(integratedVerdict(220, 220)).toBe("keep"); // 동일 → 유지
    expect(integratedVerdict(219.9, 220)).toBe("pause_candidate"); // 중단 검토
    expect(integratedVerdict(219.97, 220)).toBe("keep"); // 표시 220.0% → 유지 (표시 정밀도 기준 비교)
    expect(integratedVerdict(null, 220)).toBe("monitor"); // ROAS 계산 불가 → 추가 관찰
    expect(integratedVerdict(300, null)).toBe("monitor"); // BEP 미입력 → 추가 관찰
  });
  it("BEP 변경 시 판정이 즉시 바뀐다 (같은 ROAS)", () => {
    expect(integratedVerdict(190, 180)).toBe("keep"); // 유지
    expect(integratedVerdict(190, 220)).toBe("pause_candidate"); // → 중단 검토
    expect(integratedVerdict(190, 150)).toBe("keep"); // → 유지
  });
});

describe("통합 KPI — raw 합산 후 재계산 (비율 평균 아님)", () => {
  const H = "광고 이름,광고 ID,지출 금액,노출,링크 클릭,랜딩 페이지 조회,구매,구매 전환값";
  function mk(id: string, start: string, end: string, body: string) {
    const text = `${H}\n${body}`;
    const p = parseCsvText(text, { fileName: `${id}.csv`, fileSize: text.length });
    return buildMaterialAnalysis(
      { id, name: id, tags: [], memo: "", periodStart: start, periodEnd: end, createdAt: "2026-08-20T00:00:00.000Z",
        file: { name: p.fileName, size: p.fileSize, encoding: p.encoding, delimiter: p.delimiter }, headers: p.headers, rows: p.rows, mapping: autoMap(p.headers) },
      DEFAULT_SETTINGS,
    );
  }
  // 동일 광고 A1(id1) 두 자료: 합산 후 CTR/CPC/CVR/ROAS 재계산
  const m1 = mk("m1", "2026-08-01", "2026-08-07", "A1,1,40000,100000,2000,1000,10,120000");
  const m2 = mk("m2", "2026-08-08", "2026-08-14", "A1,1,60000,140000,3000,1500,20,240000");

  it("합계 + 재계산 값", () => {
    const r = integrate([m1, m2], "exclude", DEFAULT_SETTINGS);
    expect(r.totalSpend).toBe(100000); // 40000+60000
    expect(r.totalAgg.impressions).toBe(240000);
    expect(r.totalAgg.linkClicks).toBe(5000);
    expect(r.totalAgg.landingPageViews).toBe(2500);
    expect(r.totalAgg.purchases).toBe(30);
    expect(r.integratedEstimatedRoas).toBeCloseTo(360, 3); // 360000/100000*100

    const g = metricGroupsForAgg(r.totalAgg, r.present);
    expect(findMetric(g, "ctr")!.current).toBeCloseTo(2.0833, 3); // 5000/240000*100
    expect(findMetric(g, "cpc")!.current).toBeCloseTo(20, 3); // 100000/5000
    expect(findMetric(g, "purchaseRate")!.current).toBeCloseTo(1.2, 3); // 30/2500*100
  });
});
