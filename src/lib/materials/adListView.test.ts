import { describe, it, expect } from "vitest";
import { compareByCampaign, compareByAd, passFilters } from "@/lib/materials/adListView";

describe("compareByCampaign 정렬 (캠페인명 → 광고명, 미등록은 뒤)", () => {
  it("캠페인명 기준 정렬 후 동일 캠페인 내 광고명", () => {
    const rows = [
      { c: "B_캠페인", a: "광고2" },
      { c: "A_캠페인", a: "광고9" },
      { c: "A_캠페인", a: "광고1" },
    ];
    rows.sort((x, y) => compareByCampaign(x.c, x.a, y.c, y.a));
    expect(rows.map((r) => `${r.c}/${r.a}`)).toEqual(["A_캠페인/광고1", "A_캠페인/광고9", "B_캠페인/광고2"]);
  });
  it("캠페인명 미등록(빈값)은 항상 가장 아래", () => {
    const rows = [
      { c: "", a: "광고A" },
      { c: "Z_캠페인", a: "광고B" },
      { c: "  ", a: "광고C" },
    ];
    rows.sort((x, y) => compareByCampaign(x.c, x.a, y.c, y.a));
    expect(rows[0].c).toBe("Z_캠페인"); // 등록된 것 먼저
    expect(rows[1].a).toBe("광고A"); // 미등록끼리는 광고명순
    expect(rows[2].a).toBe("광고C");
  });
  it("자리표시자 '(캠페인 없음)'도 미등록으로 취급되어 맨 아래", () => {
    const rows = [
      { c: "(캠페인 없음)", a: "광고A" },
      { c: "B_캠페인", a: "광고B" },
    ];
    rows.sort((x, y) => compareByCampaign(x.c, x.a, y.c, y.a));
    expect(rows[0].c).toBe("B_캠페인"); // 실제 캠페인 먼저
    expect(rows[1].c).toBe("(캠페인 없음)"); // 자리표시자는 뒤로
  });
});

describe("compareByAd 정렬 (광고명 자연정렬)", () => {
  it("자연 정렬", () => {
    const names = ["광고10", "광고2", "광고1"];
    names.sort(compareByAd);
    expect(names).toEqual(["광고1", "광고2", "광고10"]);
  });
});

describe("passFilters 운영 상태 + 성과 판정", () => {
  it("전체는 모두 통과", () => {
    expect(passFilters("off", "pause_candidate", "all", "all")).toBe(true);
    expect(passFilters("active", undefined, "all", "all")).toBe(true);
  });
  it("운영 상태 필터", () => {
    expect(passFilters("active", "keep", "active", "all")).toBe(true);
    expect(passFilters("off", "keep", "active", "all")).toBe(false);
    expect(passFilters("deleted", "keep", "deleted", "all")).toBe(true);
  });
  it("성과 판정 필터", () => {
    expect(passFilters("active", "keep", "all", "keep")).toBe(true);
    expect(passFilters("active", "pause_candidate", "all", "keep")).toBe(false);
    expect(passFilters("active", undefined, "all", "keep")).toBe(false); // 판정 미상은 특정 필터에서 제외
  });
  it("복합 필터 (운영 + 판정)", () => {
    expect(passFilters("active", "keep", "active", "keep")).toBe(true);
    expect(passFilters("off", "keep", "active", "keep")).toBe(false); // 운영 불일치
    expect(passFilters("active", "monitor", "active", "keep")).toBe(false); // 판정 불일치
  });
});
