import { describe, it, expect } from "vitest";
import { evaluate } from "@/lib/verdict/engine";
import { DEFAULT_SETTINGS } from "@/lib/verdict/settings";
import { computeMetricGroups, emptyAgg } from "@/lib/metrics/calc";
import type { AggregatedInsight, AnalysisSettings, CreativeType, Verdict } from "@/lib/types";

function makeAgg(p: Partial<AggregatedInsight>): AggregatedInsight {
  return { ...emptyAgg(), hasData: true, ...p };
}

interface RunOpts {
  creativeType?: CreativeType;
  daysRunning?: number;
  spendShare?: number | null;
  revenue?: number | null;
  settings?: AnalysisSettings;
}

// 판정 실행 헬퍼 — 지표 그룹 계산 + 엔진 호출을 한 번에
function run(cur: AggregatedInsight, prev: AggregatedInsight | null, opts: RunOpts = {}): Verdict {
  const creativeType = opts.creativeType ?? "image";
  const hasPrevData = prev !== null;
  const groups = computeMetricGroups(cur, prev, creativeType, hasPrevData);
  return evaluate({
    cur,
    prev,
    hasPrevData,
    creativeType,
    daysRunning: opts.daysRunning ?? 7,
    groups,
    contributionSpendShare: opts.spendShare ?? null,
    contributionRevenue: opts.revenue ?? null,
    settings: opts.settings ?? DEFAULT_SETTINGS,
  });
}

// 성과 우수 기준 광고 (ROAS 500%, CPA 10,000)
const HEALTHY = makeAgg({
  spend: 1_000_000,
  impressions: 200_000,
  reach: 120_000,
  linkClicks: 4_000, // ctr 2%
  landingPageViews: 3_200, // landingRate 80%
  purchases: 100, // purchaseRate 3.125%
  purchaseValue: 5_000_000, // roas 500%, cpa 10,000
});

describe("규칙 기반 성과 판정 — 9개 상태", () => {
  it("데이터 부족: 광고비/노출이 최소 기준 미만", () => {
    const v = run(makeAgg({ spend: 10_000, impressions: 1_000, linkClicks: 10 }), null);
    expect(v.code).toBe("data_insufficient");
    expect(v.dataSufficiency).toBe("부족");
  });

  it("데이터 부족: 집행일이 기본 관찰 기간보다 짧으면", () => {
    const v = run(HEALTHY, null, { daysRunning: 2 });
    expect(v.code).toBe("data_insufficient");
  });

  it("확장 후보: ROAS·CPA 목표 충족 + 매출 기여도 우수", () => {
    const v = run(HEALTHY, null, { spendShare: 20, revenue: 40 });
    expect(v.code).toBe("scale_candidate");
  });

  it("유지: ROAS·CPA 목표 충족하나 기여도 우위는 아님", () => {
    const v = run(HEALTHY, null, { spendShare: 20, revenue: 22 });
    expect(v.code).toBe("keep");
  });

  it("중단 검토: 랜딩 정상이나 ROAS가 목표의 절반 미만", () => {
    const cur = makeAgg({
      spend: 1_000_000,
      impressions: 200_000,
      reach: 100_000,
      linkClicks: 4_000, // ctr 2% (양호)
      landingPageViews: 3_200, // landingRate 80% (양호)
      purchases: 20,
      purchaseValue: 1_000_000, // roas 100% (<150)
    });
    const v = run(cur, null);
    expect(v.code).toBe("pause_candidate");
  });

  it("추가 관찰: 애매한 성과 (ROAS 150~300, 구매 전환율 낮음)", () => {
    const cur = makeAgg({
      spend: 1_000_000,
      impressions: 200_000,
      reach: 100_000,
      linkClicks: 4_000, // ctr 2%
      landingPageViews: 3_200, // landingRate 80%
      purchases: 50,
      purchaseValue: 2_000_000, // roas 200%, cpa 20,000
    });
    const v = run(cur, null);
    expect(v.code).toBe("monitor");
  });

  it("소재 피로도 의심: 빈도 상승 + CTR 하락 + CPC 상승 + ROAS 하락", () => {
    const cur = makeAgg({
      spend: 1_000_000,
      impressions: 300_000,
      reach: 100_000, // freq 3.0 (>=2.5)
      linkClicks: 3_000, // ctr 1.0%
      landingPageViews: 2_400,
      purchases: 40,
      purchaseValue: 2_000_000, // roas 200%
    });
    const prev = makeAgg({
      spend: 1_000_000,
      impressions: 300_000,
      reach: 120_000,
      linkClicks: 6_000, // ctr 2.0% (현재가 하락)
      landingPageViews: 4_800,
      purchases: 100,
      purchaseValue: 5_000_000, // roas 500% (현재가 하락)
    });
    const v = run(cur, prev);
    expect(v.code).toBe("creative_fatigue");
  });

  it("소재 문제 의심: CTR 낮음 + CPC 높음", () => {
    const cur = makeAgg({
      spend: 1_000_000,
      impressions: 300_000,
      reach: 150_000, // freq 2.0
      linkClicks: 1_000, // ctr 0.33% (<1), cpc 1,000 (>800)
      landingPageViews: 600,
      purchases: 5,
      purchaseValue: 200_000,
    });
    const v = run(cur, null, { creativeType: "image" });
    expect(v.code).toBe("creative_issue");
  });

  it("랜딩 문제 의심: CTR 양호하나 랜딩 도달률 낮고 조회당 비용 높음", () => {
    const cur = makeAgg({
      spend: 1_000_000,
      impressions: 200_000,
      reach: 100_000,
      linkClicks: 4_000, // ctr 2% (양호)
      landingPageViews: 1_000, // landingRate 25% (<70), landingCost 1,000 (>500)
      purchases: 5,
      purchaseValue: 200_000,
    });
    const v = run(cur, null);
    expect(v.code).toBe("landing_issue");
  });

  it("전환 측정 문제 의심: 클릭·랜딩 정상이나 구매 0 + 전환 데이터 누락", () => {
    const cur = makeAgg({
      spend: 1_000_000,
      impressions: 200_000,
      reach: 120_000,
      linkClicks: 4_000,
      landingPageViews: 3_000,
      purchases: 0,
      purchaseValue: 0,
      conversionComplete: false,
    });
    const v = run(cur, null);
    expect(v.code).toBe("tracking_issue");
  });

  it("전환 측정 문제 의심: 이전 기간엔 구매가 있었으나 현재 0건", () => {
    const cur = makeAgg({
      spend: 1_000_000,
      impressions: 200_000,
      reach: 120_000,
      linkClicks: 4_000,
      landingPageViews: 3_000,
      purchases: 0,
      purchaseValue: 0,
      conversionComplete: true,
    });
    const prev = makeAgg({ purchases: 50, purchaseValue: 2_000_000, hasData: true });
    const v = run(cur, prev);
    expect(v.code).toBe("tracking_issue");
  });
});

describe("판정 결정론 — 같은 입력 → 같은 결과", () => {
  it("동일 입력을 반복 평가하면 완전히 동일한 판정", () => {
    const a = run(HEALTHY, null, { spendShare: 20, revenue: 40 });
    const b = run(HEALTHY, null, { spendShare: 20, revenue: 40 });
    expect(a).toEqual(b);
  });

  it("여러 상태에서 반복 실행해도 code 일관", () => {
    for (let i = 0; i < 5; i++) {
      expect(run(HEALTHY, null).code).toBe("keep");
    }
  });
});

describe("기준값은 설정으로 분리 — 설정 변경이 판정에 반영", () => {
  it("목표 ROAS를 낮추면 동일 데이터가 '데이터 부족'이 아닌 우수 판정으로 바뀐다", () => {
    // ROAS 250%인 광고
    const cur = makeAgg({
      spend: 1_000_000,
      impressions: 200_000,
      reach: 100_000,
      linkClicks: 4_000,
      landingPageViews: 3_200,
      purchases: 100,
      purchaseValue: 2_500_000, // roas 250%, cpa 10,000
    });
    // 기본 목표 ROAS 300 → 미달 → keep 아님
    expect(run(cur, null).code).not.toBe("keep");
    // 목표 ROAS 200으로 낮추면 → 충족 → keep
    const loosened: AnalysisSettings = { ...DEFAULT_SETTINGS, targetRoas: 200 };
    expect(run(cur, null, { settings: loosened }).code).toBe("keep");
  });
});
