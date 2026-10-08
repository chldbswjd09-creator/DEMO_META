import { describe, it, expect } from "vitest";
import { parseCsvText } from "@/lib/csv/parse";
import { autoMap } from "@/lib/csv/mapping";
import { DEFAULT_SETTINGS } from "@/lib/verdict/settings";
import type { Material } from "@/lib/materials/types";
import {
  aggregateMaterials,
  buildMaterialAnalysis,
  compareMaterials,
  detectDuplicates,
} from "@/lib/materials/compute";

const HEADER = "광고 이름,광고 ID,캠페인 이름,광고세트 이름,광고계정 이름,지출 금액,노출,도달,링크 클릭,구매,구매 전환값";

function makeMaterial(id: string, name: string, start: string, end: string, body: string): Material {
  const text = `${HEADER}\n${body}`;
  const p = parseCsvText(text, { fileName: `${name}.csv`, fileSize: text.length });
  return {
    id,
    name,
    tags: [],
    memo: "",
    periodStart: start,
    periodEnd: end,
    createdAt: "2026-08-20T00:00:00.000Z",
    file: { name: p.fileName, size: p.fileSize, encoding: p.encoding, delimiter: p.delimiter },
    headers: p.headers,
    rows: p.rows,
    mapping: autoMap(p.headers),
  };
}

const A = makeMaterial("a", "8월1주", "2026-08-01", "2026-08-07", `X,1,C,S,ACC,100000,50000,25000,1000,20,800000
Y,2,C,S,ACC,50000,20000,10000,300,5,150000`);
const B = makeMaterial("b", "8월2주", "2026-08-08", "2026-08-14", `X,1,C,S,ACC,120000,60000,30000,1200,30,1200000
Z,3,C,S,ACC,40000,15000,8000,200,3,80000`);
const ADUP = makeMaterial("adup", "8월1주 중복", "2026-08-01", "2026-08-07", `X,1,C,S,ACC,100000,50000,25000,1000,20,800000`);

const anA = buildMaterialAnalysis(A, DEFAULT_SETTINGS);
const anB = buildMaterialAnalysis(B, DEFAULT_SETTINGS);
const anDup = buildMaterialAnalysis(ADUP, DEFAULT_SETTINGS);

describe("자료 1개 분석", () => {
  it("광고 수·합계·ROAS 계산", () => {
    expect(anA.adCount).toBe(2);
    expect(anA.total.spend).toBe(150000);
    // ROAS = 950000/150000*100
    const roas = (anA.total.purchaseValue / anA.total.spend) * 100;
    expect(roas).toBeCloseTo(633.33, 1);
  });
});

describe("합산 — 비율 지표 재계산 (평균 아님)", () => {
  it("서로 다른 기간 자료 합산은 원본값 합계 후 재계산", () => {
    const r = aggregateMaterials([anA, anB], "exclude", DEFAULT_SETTINGS);
    expect(r.adCount).toBe(4); // 기간이 달라 X는 중복 아님
    expect(r.agg.spend).toBe(310000);
    expect(r.agg.purchaseValue).toBe(2230000);
    const aggRoas = (r.agg.purchaseValue / r.agg.spend) * 100; // 719.35
    // 개별 ROAS 평균과 다름을 확인
    const roasA = (anA.total.purchaseValue / anA.total.spend) * 100; // 633.3
    const roasB = (anB.total.purchaseValue / anB.total.spend) * 100; // 800
    const avg = (roasA + roasB) / 2; // 716.7
    expect(aggRoas).toBeCloseTo(719.35, 1);
    expect(Math.abs(aggRoas - avg)).toBeGreaterThan(1); // 평균과 다름
  });
});

describe("중복 감지 및 제외/포함 합산", () => {
  it("동일 광고·동일 기간 중복 감지", () => {
    const dups = detectDuplicates([anA, anDup]);
    expect(dups.length).toBe(1); // X id1, 08-01~07
    expect(dups[0].materialIds.sort()).toEqual(["a", "adup"]);
  });

  it("중복 제외 시 X는 한 번만 합산", () => {
    const excl = aggregateMaterials([anA, anDup], "exclude", DEFAULT_SETTINGS);
    expect(excl.agg.spend).toBe(150000); // X 100000 + Y 50000 (Adup의 X 제외)
  });

  it("중복 포함 시 X가 두 번 합산", () => {
    const incl = aggregateMaterials([anA, anDup], "include", DEFAULT_SETTINGS);
    expect(incl.agg.spend).toBe(250000); // X 100000*2 + Y 50000
  });
});

describe("비교 — 유리한 값 강조 (방향 반영, 데이터 없음 제외)", () => {
  const cmp = compareMaterials([anA, anB]);
  it("ROAS는 높은 쪽(B) 강조", () => {
    const roas = cmp.metricRows.find((r) => r.key === "roas")!;
    expect(roas.direction).toBe("higher_better");
    expect(roas.bestIndex).toBe(1); // B
  });
  it("CPA는 낮은 쪽(B) 강조", () => {
    const cpa = cmp.metricRows.find((r) => r.key === "cpa")!;
    expect(cpa.direction).toBe("lower_better");
    expect(cpa.bestIndex).toBe(1); // B (4848 < 6000)
  });
  it("빈도(neutral)는 강조하지 않음", () => {
    expect(cmp.metricRows.find((r) => r.key === "frequency")!.bestIndex).toBeNull();
  });
  it("원본 합계 행 포함", () => {
    expect(cmp.rawRows.find((r) => r.key === "spend")!.values).toEqual([150000, 160000]);
  });
});
