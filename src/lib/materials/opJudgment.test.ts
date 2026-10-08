import { describe, it, expect } from "vitest";
import { judgeOperation, type OpInput } from "@/lib/materials/opJudgment";

function base(p: Partial<OpInput>): OpInput {
  return { name: "ad", elapsedDays: null, impressions: null, ctr: null, linkClicks: null, purchases: null, cvr: null, roas: null, bepRoas: null, ...p };
}

describe("judgeOperation — 운영 판단 (퍼널 기준)", () => {
  it("CASE 1: 2일/노출800/CTR3/구매1 → 추가 관찰 (집행 기간·노출 부족)", () => {
    const r = judgeOperation(base({ elapsedDays: 2, impressions: 800, ctr: 3, linkClicks: 24, purchases: 1, cvr: 4 }));
    expect(r.verdict).toBe("monitor");
    expect(r.sentence).toContain("부족");
  });

  it("CASE 2: 4일/노출2400/CTR0.9/구매0 → 추가 관찰 (1차 낮지만 추가 확인)", () => {
    const r = judgeOperation(base({ elapsedDays: 4, impressions: 2400, ctr: 0.9, linkClicks: 40, purchases: 0, cvr: 0 }));
    expect(r.verdict).toBe("monitor");
    expect(r.imprLevel).toBe("1차 판단 가능");
  });

  it("CASE 3: 6일/노출5000/CTR0.8/구매0/ROAS<BEP → 중단 검토", () => {
    const r = judgeOperation(base({ elapsedDays: 6, impressions: 5000, ctr: 0.8, linkClicks: 40, purchases: 0, cvr: 0, roas: 90, bepRoas: 150 }));
    expect(r.verdict).toBe("pause_candidate");
    expect(r.sentence).toContain("CTR이 낮고 구매전환도 발생하지 않았");
  });

  it("CASE 4: 6일/노출5000/CTR2.8/클릭140/구매2 → CVR 참고용", () => {
    const r = judgeOperation(base({ elapsedDays: 6, impressions: 5000, ctr: 2.8, linkClicks: 140, purchases: 2, cvr: 1.4 }));
    expect(r.cvrReference).toBe(true); // 구매 1~2건 → 참고용
    expect(r.sentence).toContain("참고용");
  });

  it("CASE 5: 7일/노출7000/CTR2.6/클릭182/구매10/ROAS>=BEP → 유지", () => {
    const r = judgeOperation(base({ elapsedDays: 7, impressions: 7000, ctr: 2.6, linkClicks: 182, purchases: 10, cvr: 5.5, roas: 200, bepRoas: 150 }));
    expect(r.verdict).toBe("keep");
    expect(r.cvrReference).toBe(false); // 클릭>=30 & 구매>=3
    expect(r.roasSentence).toContain("상회");
  });

  it("CASE 6: 7일/노출7000/CTR2.6/구매10/ROAS<BEP → 중단 검토(전환은 발생, 수익성 미달)", () => {
    const r = judgeOperation(base({ elapsedDays: 7, impressions: 7000, ctr: 2.6, linkClicks: 180, purchases: 10, cvr: 5.5, roas: 120, bepRoas: 150 }));
    expect(r.verdict).toBe("pause_candidate");
    expect(r.sentence).toContain("수익성이 부족");
  });
});

describe("예외 처리", () => {
  it("구매 열 없음(null) → '구매 데이터 확인 불가', 구매 0으로 해석 안 함", () => {
    const r = judgeOperation(base({ elapsedDays: 6, impressions: 5000, ctr: 2.5, linkClicks: 100, purchases: null }));
    expect(r.purchaseText).toBe("구매 데이터 확인 불가");
    expect(r.summaryLine).toContain("구매 데이터 확인 불가");
  });
  it("실제 구매 0 → '구매 0건'", () => {
    const r = judgeOperation(base({ elapsedDays: 6, impressions: 5000, ctr: 2.5, linkClicks: 100, purchases: 0 }));
    expect(r.purchaseText).toBe("구매 0건");
  });
  it("ROAS/BEP 계산 불가 → roasSentence null", () => {
    const r = judgeOperation(base({ elapsedDays: 6, impressions: 5000, ctr: 2.5, roas: null, bepRoas: 150 }));
    expect(r.roasSentence).toBeNull();
  });
});
