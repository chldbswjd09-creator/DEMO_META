import { describe, it, expect } from "vitest";
import {
  aggregate,
  computeContribution,
  computeMetricGroups,
  emptyAgg,
  findMetric,
} from "@/lib/metrics/calc";
import type { AggregatedInsight, CreativeType, DailyInsight, VideoInsight } from "@/lib/types";

// 테스트용 집계 헬퍼
function makeAgg(p: Partial<AggregatedInsight>): AggregatedInsight {
  return { ...emptyAgg(), hasData: true, ...p };
}

// 지표 값/상태 추출 헬퍼
function metric(
  cur: AggregatedInsight,
  key: string,
  creativeType: CreativeType = "video",
  prev: AggregatedInsight | null = null,
) {
  const groups = computeMetricGroups(cur, prev, creativeType, prev !== null);
  return findMetric(groups, key)!;
}

const HEALTHY = makeAgg({
  spend: 100_000,
  impressions: 50_000,
  reach: 25_000,
  linkClicks: 1_000,
  landingPageViews: 800,
  purchases: 20,
  purchaseValue: 800_000,
  video3s: 10_000,
  video50: 5_000,
  video100: 2_000,
  hasVideoData: true,
});

describe("지표 계산 — 정상 케이스", () => {
  it("1. CPM = 광고비 ÷ 노출 × 1000", () => {
    expect(metric(HEALTHY, "cpm").current).toBe(2_000);
  });
  it("2. 빈도 = 노출 ÷ 도달", () => {
    expect(metric(HEALTHY, "frequency").current).toBe(2);
  });
  it("3. 링크 CTR = 링크클릭 ÷ 노출 × 100", () => {
    expect(metric(HEALTHY, "ctr").current).toBe(2);
  });
  it("4. 링크 CPC = 광고비 ÷ 링크클릭", () => {
    expect(metric(HEALTHY, "cpc").current).toBe(100);
  });
  it("5. 랜딩 도달률 = 랜딩조회 ÷ 링크클릭 × 100", () => {
    expect(metric(HEALTHY, "landingRate").current).toBe(80);
  });
  it("6. 랜딩 조회당 비용 = 광고비 ÷ 랜딩조회", () => {
    expect(metric(HEALTHY, "landingCost").current).toBe(125);
  });
  it("7. 구매 전환율 = 구매 ÷ 랜딩조회 × 100", () => {
    expect(metric(HEALTHY, "purchaseRate").current).toBeCloseTo(2.5, 6);
  });
  it("8. CPA = 광고비 ÷ 구매", () => {
    expect(metric(HEALTHY, "cpa").current).toBe(5_000);
  });
  it("9. 객단가 = 구매매출 ÷ 구매", () => {
    expect(metric(HEALTHY, "aov").current).toBe(40_000);
  });
  it("10. ROAS = 구매매출 ÷ 광고비 × 100", () => {
    expect(metric(HEALTHY, "roas").current).toBe(800);
  });
  it("11. 후킹률 = 3초재생 ÷ 노출 × 100", () => {
    expect(metric(HEALTHY, "hookRate").current).toBe(20);
  });
  it("12. 유지율 = 50%재생 ÷ 3초재생 × 100", () => {
    expect(metric(HEALTHY, "holdRate").current).toBe(50);
  });
  it("13. 완주율 = 100%재생 ÷ 3초재생 × 100", () => {
    expect(metric(HEALTHY, "completionRate").current).toBe(20);
  });
});

describe("성과 기여도 (14~18)", () => {
  const adAgg = makeAgg({ spend: 20_000, purchases: 34, purchaseValue: 380_000 });
  const totalAgg = makeAgg({ spend: 100_000, purchases: 100, purchaseValue: 1_000_000 });

  it("14. 광고비 비중", () => {
    expect(computeContribution(adAgg, totalAgg, "adset").spendShare).toBe(20);
  });
  it("15. 구매 기여도", () => {
    expect(computeContribution(adAgg, totalAgg, "adset").purchaseContribution).toBe(34);
  });
  it("16. 매출 기여도", () => {
    expect(computeContribution(adAgg, totalAgg, "adset").revenueContribution).toBe(38);
  });
  it("17. 광고비 비중 대비 구매 기여도 차이 = 구매기여 - 비중", () => {
    expect(computeContribution(adAgg, totalAgg, "adset").purchaseVsSpend).toBe(14);
  });
  it("18. 광고비 비중 대비 매출 기여도 차이 = 매출기여 - 비중", () => {
    expect(computeContribution(adAgg, totalAgg, "adset").revenueVsSpend).toBe(18);
  });
});

describe("19. 이전 기간 대비 증감률", () => {
  it("현재>이전 이면 양수 증감률", () => {
    const cur = makeAgg({ impressions: 50_000, linkClicks: 1_000 }); // ctr 2%
    const prev = makeAgg({ impressions: 50_000, linkClicks: 500 }); // ctr 1%
    const m = metric(cur, "ctr", "image", prev);
    expect(m.previous).toBe(1);
    expect(m.changePct).toBeCloseTo(100, 6);
    expect(m.changeNote).toBe("normal");
  });

  it("이전 기간 데이터가 없으면 no_previous (증감률 null)", () => {
    const cur = makeAgg({ impressions: 50_000, linkClicks: 1_000 });
    const m = metric(cur, "ctr", "image", null);
    expect(m.changeNote).toBe("no_previous");
    expect(m.changePct).toBeNull();
  });

  it("이전 기간 값이 0이고 현재>0 이면 '신규 발생'(무한대 표시 금지)", () => {
    const cur = makeAgg({ impressions: 50_000, linkClicks: 1_000 }); // ctr 2%
    const prev = makeAgg({ impressions: 50_000, linkClicks: 0 }); // ctr 0%
    const m = metric(cur, "ctr", "image", prev);
    expect(m.previous).toBe(0);
    expect(m.changeNote).toBe("new");
    expect(m.changePct).toBeNull();
  });
});

describe("지표 예외 처리", () => {
  it("분모가 0이면 계산 불가 (CPM/CTR/CPC/빈도/랜딩)", () => {
    const zero = makeAgg({ spend: 1000 }); // impressions/reach/clicks/lpv 모두 0
    expect(metric(zero, "cpm").state).toBe("cannot_calc");
    expect(metric(zero, "cpm").current).toBeNull();
    expect(metric(zero, "frequency").state).toBe("cannot_calc");
    expect(metric(zero, "ctr").state).toBe("cannot_calc");
    expect(metric(zero, "cpc").state).toBe("cannot_calc");
    expect(metric(zero, "landingRate").state).toBe("cannot_calc");
    expect(metric(zero, "landingCost").state).toBe("cannot_calc");
    expect(metric(zero, "purchaseRate").state).toBe("cannot_calc");
  });

  it("구매가 0이면 CPA는 no_purchase (0원으로 표기하지 않음)", () => {
    const noPurchase = makeAgg({ spend: 50_000, impressions: 10_000, purchases: 0 });
    const cpa = metric(noPurchase, "cpa");
    expect(cpa.state).toBe("no_purchase");
    expect(cpa.current).toBeNull();
    expect(metric(noPurchase, "aov").state).toBe("no_purchase");
  });

  it("구매 매출이 없으면 ROAS 계산 불가", () => {
    const noRevenue = makeAgg({ spend: 50_000, purchases: 5, purchaseValue: 0 });
    expect(metric(noRevenue, "roas").state).toBe("cannot_calc");
    expect(metric(noRevenue, "roas").current).toBeNull();
  });

  it("광고비가 0이면 ROAS 계산 불가", () => {
    const noSpend = makeAgg({ spend: 0, purchaseValue: 100_000, purchases: 2 });
    expect(metric(noSpend, "roas").state).toBe("cannot_calc");
  });

  it("영상이 아닌 광고는 영상 지표가 '적용 대상 아님'(na), 0%로 표기하지 않음", () => {
    const img = makeAgg({ impressions: 10_000, video3s: 0, hasVideoData: false });
    const hook = metric(img, "hookRate", "image");
    expect(hook.state).toBe("na");
    expect(hook.current).toBeNull();
    expect(metric(img, "holdRate", "image").state).toBe("na");
  });

  it("영상 광고이지만 재생 데이터가 누락되면 'no_data'(0%로 표기하지 않음)", () => {
    const vidMissing = makeAgg({ impressions: 10_000, hasVideoData: false });
    const hook = metric(vidMissing, "hookRate", "video");
    expect(hook.state).toBe("no_data");
    expect(hook.current).toBeNull();
    expect(metric(vidMissing, "holdRate", "video").state).toBe("no_data");
    expect(metric(vidMissing, "completionRate", "video").state).toBe("no_data");
  });

  it("영상 재생 데이터가 있으면 정상 계산", () => {
    const vid = makeAgg({ impressions: 10_000, video3s: 2_000, video50: 1_000, video100: 400, hasVideoData: true });
    expect(metric(vid, "hookRate", "video").current).toBe(20);
    expect(metric(vid, "holdRate", "video").current).toBe(50);
  });
});

describe("성과 기여도 예외 — 비교 범위 전체 구매/매출 0", () => {
  it("전체 구매/매출이 0이면 기여도는 null(계산 불가), 0%로 표기하지 않음", () => {
    const adAgg = makeAgg({ spend: 20_000, purchases: 0, purchaseValue: 0 });
    const totalAgg = makeAgg({ spend: 100_000, purchases: 0, purchaseValue: 0 });
    const c = computeContribution(adAgg, totalAgg, "adset");
    expect(c.spendShare).toBe(20); // 광고비 비중은 계산 가능
    expect(c.purchaseContribution).toBeNull();
    expect(c.revenueContribution).toBeNull();
    expect(c.purchaseVsSpend).toBeNull();
    expect(c.revenueVsSpend).toBeNull();
  });

  it("전체 광고비가 0이면 canCalc=false, 비중 null", () => {
    const c = computeContribution(makeAgg({}), makeAgg({ spend: 0 }), "adset");
    expect(c.canCalc).toBe(false);
    expect(c.spendShare).toBeNull();
  });
});

describe("집계 — 전환/영상 데이터 누락 & 일부 날짜 누락", () => {
  const base = (over: Partial<DailyInsight>): DailyInsight => ({
    date: "2026-08-01",
    adId: "ad_x",
    spend: 1000,
    impressions: 1000,
    reach: 800,
    linkClicks: 20,
    landingPageViews: 15,
    purchases: 1,
    purchaseValue: 40000,
    currency: "KRW",
    conversionComplete: true,
    ...over,
  });

  it("일부 날짜의 전환 데이터가 누락되면 conversionComplete=false로 집계", () => {
    const dailies = [base({ date: "2026-08-01" }), base({ date: "2026-08-02", conversionComplete: false })];
    const agg = aggregate(dailies, []);
    expect(agg.conversionComplete).toBe(false);
    expect(agg.spend).toBe(2000); // 존재하는 날짜만 합산
  });

  it("영상 인사이트가 아예 없으면 hasVideoData=false", () => {
    const agg = aggregate([base({})], []);
    expect(agg.hasVideoData).toBe(false);
  });

  it("영상 인사이트가 있으면 hasVideoData=true, 합산", () => {
    const videos: VideoInsight[] = [
      { date: "2026-08-01", adId: "ad_x", video3s: 100, video50: 50, video100: 20, videoComplete: true },
    ];
    const agg = aggregate([base({})], videos);
    expect(agg.hasVideoData).toBe(true);
    expect(agg.video3s).toBe(100);
  });

  it("빈 입력이면 hasData=false", () => {
    expect(aggregate([], []).hasData).toBe(false);
  });
});
