import { describe, it, expect } from "vitest";
import {
  uniqueCampaigns,
  displayCampaign,
  campaignSearchText,
  campaignMatches,
  mergedCampaignDisplay,
  isRealCampaign,
  normalizeCampaign,
  CSV_EMPTY_CAMPAIGN,
  NO_CAMPAIGN_LABEL,
} from "@/lib/materials/campaign";

describe("uniqueCampaigns", () => {
  it("고유값만 등장 순서대로, 빈값/공백 제외", () => {
    expect(uniqueCampaigns(["MZ_메인", "MZ_메인", "MZ_테스트", "", "  ", undefined, null])).toEqual(["MZ_메인", "MZ_테스트"]);
    expect(uniqueCampaigns([" A ", "A"])).toEqual(["A"]); // trim 후 동일
    expect(uniqueCampaigns([])).toEqual([]);
  });
});

describe("displayCampaign 표시 우선순위 (CSV > 수기 > 미등록)", () => {
  it("CSV 1개면 그대로", () => {
    const d = displayCampaign(["MZ_메인"], "무시됨");
    expect(d.label).toBe("MZ_메인");
    expect(d.source).toBe("csv");
    expect(d.full).toEqual(["MZ_메인"]);
  });
  it("CSV 여러 개면 '외 N개'", () => {
    const d = displayCampaign(["MZ_메인", "MZ_테스트", "MZ_리타겟"], null);
    expect(d.label).toBe("MZ_메인 외 2개");
    expect(d.full).toEqual(["MZ_메인", "MZ_테스트", "MZ_리타겟"]);
  });
  it("CSV 없고 수기 있으면 수기", () => {
    const d = displayCampaign([], "직접입력");
    expect(d.label).toBe("직접입력");
    expect(d.source).toBe("manual");
  });
  it("둘 다 없으면 미등록", () => {
    const d = displayCampaign([], "");
    expect(d.label).toBe(NO_CAMPAIGN_LABEL);
    expect(d.source).toBe("none");
    expect(displayCampaign([], undefined).source).toBe("none");
  });
});

describe("campaignMatches 검색 (부분·대소문자 무시, CSV+수기)", () => {
  it("빈 검색어는 항상 true", () => {
    expect(campaignMatches("", [], null)).toBe(true);
    expect(campaignMatches("   ", ["A"], null)).toBe(true);
  });
  it("CSV 캠페인 부분 일치", () => {
    expect(campaignMatches("mz", ["MZ_메인"], null)).toBe(true); // 대소문자 무시
    expect(campaignMatches("테스트", ["MZ_메인", "MZ_테스트"], null)).toBe(true);
    expect(campaignMatches("없음", ["MZ_메인"], null)).toBe(false);
  });
  it("수기 캠페인도 검색 대상", () => {
    expect(campaignMatches("직접", [], "직접입력캠페인")).toBe(true);
    expect(campaignSearchText(["A"], "B")).toContain("b");
  });
});

describe("mergedCampaignDisplay", () => {
  it("통합 광고의 여러 캠페인명을 '외 N개'로", () => {
    expect(mergedCampaignDisplay(["c1", "c2"]).label).toBe("c1 외 1개");
    expect(mergedCampaignDisplay([]).label).toBe(NO_CAMPAIGN_LABEL);
  });
});

describe("자리표시자 '(캠페인 없음)' 처리 (수기 fallback 버그 회귀 방지)", () => {
  it("isRealCampaign: 빈값/공백/자리표시자는 false", () => {
    expect(isRealCampaign(CSV_EMPTY_CAMPAIGN)).toBe(false);
    expect(isRealCampaign(" (캠페인 없음) ")).toBe(false);
    expect(isRealCampaign("")).toBe(false);
    expect(isRealCampaign("   ")).toBe(false);
    expect(isRealCampaign("MZ_메인")).toBe(true);
  });
  it("normalizeCampaign: 자리표시자 → 빈 문자열", () => {
    expect(normalizeCampaign(CSV_EMPTY_CAMPAIGN)).toBe("");
    expect(normalizeCampaign("  MZ_메인  ")).toBe("MZ_메인");
  });
  it("uniqueCampaigns: 자리표시자를 CSV 캠페인으로 잡지 않음", () => {
    expect(uniqueCampaigns([CSV_EMPTY_CAMPAIGN, CSV_EMPTY_CAMPAIGN])).toEqual([]);
    expect(uniqueCampaigns([CSV_EMPTY_CAMPAIGN, "MZ_메인"])).toEqual(["MZ_메인"]);
  });
  it("displayCampaign: CSV가 자리표시자뿐이면 수기값으로 fallback (핵심 버그)", () => {
    const csv = uniqueCampaigns([CSV_EMPTY_CAMPAIGN]); // = []
    const d = displayCampaign(csv, "테스트");
    expect(d.source).toBe("manual");
    expect(d.label).toBe("테스트");
  });
  it("displayCampaign: 자리표시자뿐 + 수기 없음이면 미등록", () => {
    expect(displayCampaign(uniqueCampaigns([CSV_EMPTY_CAMPAIGN]), "").source).toBe("none");
  });
  it("campaignMatches: 자리표시자 자료는 수기값으로만 검색됨", () => {
    const csv = uniqueCampaigns([CSV_EMPTY_CAMPAIGN]); // = []
    expect(campaignMatches("테스트", csv, "테스트")).toBe(true);
    expect(campaignMatches("없음", csv, "테스트")).toBe(false); // '(캠페인 없음)'으로는 검색 안 됨
  });
});
