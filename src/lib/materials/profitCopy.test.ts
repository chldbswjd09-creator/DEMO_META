import { describe, it, expect } from "vitest";
import { profitSentence, profitIssueSentence, profitVerdictOf, diffPpText } from "@/lib/materials/profitCopy";

describe("profitVerdictOf / diffPpText", () => {
  it("추정 ROAS·입력 BEP ROAS로 판정 도출", () => {
    expect(profitVerdictOf(312.4, 220)).toBe("BEP 초과");
    expect(profitVerdictOf(185, 220)).toBe("BEP 미달");
    expect(profitVerdictOf(220, 220)).toBe("손익분기");
    expect(profitVerdictOf(null, 220)).toBe("추정 ROAS 계산 불가");
    expect(profitVerdictOf(300, null)).toBe("BEP ROAS 입력 필요");
  });
  it("BEP 대비 %p 표기", () => {
    expect(diffPpText(92.4)).toBe("+92.4%p");
    expect(diffPpText(-35)).toBe("-35.0%p");
    expect(diffPpText(0)).toBe("0.0%p");
    expect(diffPpText(null)).toBe("-");
  });
});

const base = { name: "0804_image_07", dataInsufficient: false };

describe("profitSentence — 수익성 핵심 문장", () => {
  it("BEP 초과", () => {
    const s = profitSentence({ ...base, estimatedRoas: 312.4, bepRoas: 220, diffPp: 92.4, verdict: "BEP 초과" });
    expect(s).toContain("추정 ROAS 312.4%");
    expect(s).toContain("BEP ROAS 220.0%");
    expect(s).toContain("+92.4%p");
    expect(s).toContain("BEP 초과");
  });
  it("BEP 미달", () => {
    const s = profitSentence({ ...base, estimatedRoas: 185, bepRoas: 220, diffPp: -35, verdict: "BEP 미달" });
    expect(s).toContain("-35.0%p");
    expect(s).toContain("미달");
  });
  it("손익분기", () => {
    const s = profitSentence({ ...base, estimatedRoas: 220, bepRoas: 220, diffPp: 0, verdict: "손익분기" });
    expect(s).toContain("손익분기");
  });
  it("추정 ROAS 계산 불가", () => {
    const s = profitSentence({ ...base, estimatedRoas: null, bepRoas: 220, diffPp: null, verdict: "추정 ROAS 계산 불가" });
    expect(s).toContain("추정 ROAS를 계산할 수 없");
  });
  it("BEP ROAS 미입력", () => {
    const s = profitSentence({ ...base, estimatedRoas: 300, bepRoas: null, diffPp: null, verdict: "BEP ROAS 입력 필요" });
    expect(s).toContain("BEP ROAS");
    expect(s).toContain("입력");
  });
  it("데이터 부족 + BEP 초과", () => {
    const s = profitSentence({ ...base, dataInsufficient: true, estimatedRoas: 500, bepRoas: 220, diffPp: 280, verdict: "BEP 초과" });
    expect(s).toContain("부족");
  });
});

describe("profitIssueSentence — 주요 이슈 조합", () => {
  it("BEP 미달 + CPA 높음", () => {
    expect(profitIssueSentence("BEP 미달", true, false)).toContain("CPA도 높은");
  });
  it("BEP 초과 + 데이터 충분", () => {
    expect(profitIssueSentence("BEP 초과", false, false)).toContain("데이터도 충분");
  });
  it("BEP 초과 + 데이터 부족", () => {
    expect(profitIssueSentence("BEP 초과", false, true)).toContain("추가 관찰");
  });
  it("해당 없음 → null", () => {
    expect(profitIssueSentence("BEP ROAS 입력 필요", null, false)).toBeNull();
  });
});
