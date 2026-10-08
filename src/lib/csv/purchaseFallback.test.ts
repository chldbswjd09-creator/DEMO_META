import { describe, it, expect } from "vitest";
import { autoMap } from "@/lib/csv/mapping";
import { buildDataset } from "@/lib/csv/dataset";
import { isPurchaseResultType } from "@/lib/csv/purchaseFallback";
import { metricGroupsForAgg } from "@/lib/materials/compute";
import { findMetric } from "@/lib/metrics/calc";
import type { ParsedFile } from "@/lib/csv/parse";

function parsed(headers: string[], rows: Record<string, string>[]): ParsedFile {
  return { fileName: "meta.csv", fileSize: 1000, encoding: "utf-8", delimiter: ",", headers, rows, rowCount: rows.length };
}
function firstAgg(headers: string[], rows: Record<string, string>[]) {
  const ds = buildDataset([parsed(headers, rows)], [], autoMap(headers));
  const rec = [...ds.recordsByKey.values()][0];
  return { ds, agg: rec.cur!, present: ds.presentPerfFields };
}

// ── 260809: 전용 구매/전환값/ROAS/결과 모두 있음 ──
const H_0809 = [
  "광고 이름", "지출 금액 (KRW)", "노출", "링크 클릭", "랜딩 페이지 조회",
  "웹사이트 직접 구매", "웹사이트 직접 구매 전환값", "구매 ROAS(광고 지출 대비 수익률)",
  "결과", "결과 표시 도구", "결과당 비용", "결과 ROAS", "결과 ROAS 표시 도구",
  "보고 시작", "보고 종료", "광고 ID",
];
// ── 260810: 전용 구매/전환값 없음, 구매 ROAS + 결과(+표시도구=purchase) 있음 ──
const H_0810 = [
  "광고 이름", "지출 금액 (KRW)", "노출", "링크 클릭", "랜딩 페이지 조회",
  "구매 ROAS(광고 지출 대비 수익률)",
  "결과", "결과 표시 도구", "결과당 비용", "결과 ROAS", "결과 ROAS 표시 도구",
  "보고 시작", "보고 종료", "광고 ID",
];

describe("isPurchaseResultType — 보수적 purchase 판정", () => {
  it("명확한 구매 유형은 인정", () => {
    expect(isPurchaseResultType("구매")).toBe(true);
    expect(isPurchaseResultType("웹사이트 구매")).toBe(true);
    expect(isPurchaseResultType("offsite_conversion.fb_pixel_purchase")).toBe(true);
    expect(isPurchaseResultType("fb_pixel_purchase")).toBe(true);
    expect(isPurchaseResultType("Purchases")).toBe(true);
  });
  it("구매가 아닌 유형/빈 값은 거부", () => {
    expect(isPurchaseResultType("link_click")).toBe(false);
    expect(isPurchaseResultType("링크 클릭")).toBe(false);
    expect(isPurchaseResultType("landing_page_view")).toBe(false);
    expect(isPurchaseResultType("lead")).toBe(false);
    expect(isPurchaseResultType("잠재고객")).toBe(false);
    expect(isPurchaseResultType("engagement")).toBe(false);
    expect(isPurchaseResultType("")).toBe(false);
    expect(isPurchaseResultType(undefined)).toBe(false);
    expect(isPurchaseResultType(null)).toBe(false);
    // 구매 이전 단계(장바구니/결제 시작)는 제외
    expect(isPurchaseResultType("add_to_cart")).toBe(false);
    expect(isPurchaseResultType("장바구니에 담기")).toBe(false);
    expect(isPurchaseResultType("initiate_checkout")).toBe(false);
  });
});

describe("매핑 가드 — 결과/결과 표시 도구 오매핑 방지", () => {
  it("'결과'는 결과당 비용/결과 ROAS/결과 표시 도구가 아니라 순수 '결과' 열에만 매핑", () => {
    const m = autoMap(H_0810);
    expect(m.resultCount.header).toBe("결과");
    expect(m.resultIndicator.header).toBe("결과 표시 도구");
    // 오매핑 금지
    expect(m.resultCount.header).not.toBe("결과당 비용");
    expect(m.resultCount.header).not.toBe("결과 ROAS");
    expect(m.resultCount.header).not.toBe("결과 표시 도구");
    expect(m.resultIndicator.header).not.toBe("결과 ROAS 표시 도구");
    // 구매 계열은 여전히 분리 (구매 ROAS만 존재)
    expect(m.purchases.header).toBeNull();
    expect(m.purchaseValue.header).toBeNull();
    expect(m.purchaseRoas.header).toBe("구매 ROAS(광고 지출 대비 수익률)");
  });
});

describe("260809 — 전용 구매 열 우선 (기존 동작 보존)", () => {
  it("구매/구매매출/Meta ROAS 모두 전용 열에서, 결과 fallback 미사용", () => {
    const row = {
      "광고 이름": "A", "지출 금액 (KRW)": "50000", "노출": "3000", "링크 클릭": "60", "랜딩 페이지 조회": "50",
      "웹사이트 직접 구매": "5", "웹사이트 직접 구매 전환값": "150000", "구매 ROAS(광고 지출 대비 수익률)": "3.0",
      "결과": "9", "결과 표시 도구": "구매", "결과당 비용": "10000", "결과 ROAS": "3.0", "결과 ROAS 표시 도구": "구매",
      "보고 시작": "2026-08-09", "보고 종료": "2026-08-09", "광고 ID": "1",
    };
    const { agg, present } = firstAgg(H_0809, [row]);
    expect(present).toContain("purchases");
    expect(present).toContain("purchaseValue");
    expect(agg.purchases).toBe(5); // 전용 열 우선 — 결과 9로 덮어쓰지 않음
    expect(agg.purchaseValue).toBe(150000);
    expect(agg.purchasesSource).toBe("direct_purchase_column");
    expect(agg.purchaseValueSource).toBe("direct_purchase_value_column");
    expect(agg.metaRoasSource).toBe("direct_meta_roas_column");
  });
});

describe("260810 — 전용 구매 열 없음, 결과(purchase) fallback", () => {
  it("구매=결과 fallback, 구매매출=원본 열 없음, Meta ROAS=원본값", () => {
    const row = {
      "광고 이름": "B", "지출 금액 (KRW)": "50000", "노출": "3000", "링크 클릭": "60", "랜딩 페이지 조회": "50",
      "구매 ROAS(광고 지출 대비 수익률)": "3.0",
      "결과": "9", "결과 표시 도구": "구매", "결과당 비용": "5555", "결과 ROAS": "3.0", "결과 ROAS 표시 도구": "구매",
      "보고 시작": "2026-08-10", "보고 종료": "2026-08-10", "광고 ID": "2",
    };
    const { agg, present } = firstAgg(H_0810, [row]);
    // 구매 = 정상 표시 (결과 fallback)
    expect(present).toContain("purchases");
    expect(agg.purchases).toBe(9);
    expect(agg.purchasesSource).toBe("result_purchase_fallback");
    // 구매매출 = 원본 열 없음
    expect(present).not.toContain("purchaseValue");
    expect(agg.purchaseValue).toBe(0);
    expect(agg.purchaseValueSource).toBe("unavailable");
    // Meta ROAS = 원본 열 사용 (역산 금액 존재)
    expect(agg.metaRoasSource).toBe("direct_meta_roas_column");
    expect(agg.metaRevenueEst).toBeCloseTo(150000, 0); // 50000 × 3.0

    const g = metricGroupsForAgg(agg, present);
    // 구매전환율/CPA 는 fallback 구매로 계산 가능
    expect(findMetric(g, "purchaseRate")!.state).toBe("ok");
    expect(findMetric(g, "purchaseRate")!.current).toBeCloseTo(18, 3); // 9/50*100
    expect(findMetric(g, "cpa")!.state).toBe("ok");
    // 구매매출 기반 지표(ROAS/객단가)는 원본 열 없음
    expect(findMetric(g, "roas")!.state).toBe("missing_column");
    expect(findMetric(g, "aov")!.state).toBe("missing_column");
  });
});

describe("추가 케이스 (CASE 1~7)", () => {
  const HRES = ["광고 이름", "지출 금액 (KRW)", "노출", "링크 클릭", "랜딩 페이지 조회", "결과", "결과 표시 도구", "광고 ID"];
  const HRES_PURCH = [...HRES.slice(0, 5), "웹사이트 직접 구매", "결과", "결과 표시 도구", "광고 ID"];
  const HNO = ["광고 이름", "지출 금액 (KRW)", "노출", "링크 클릭", "랜딩 페이지 조회", "광고 ID"];
  const baseRow = { "광고 이름": "x", "지출 금액 (KRW)": "50000", "노출": "3000", "링크 클릭": "60", "랜딩 페이지 조회": "50", "광고 ID": "9" };

  it("CASE 1: 결과=10 + 유형 purchase → 구매 10", () => {
    const { agg, present } = firstAgg(HRES, [{ ...baseRow, "결과": "10", "결과 표시 도구": "구매" }]);
    expect(present).toContain("purchases");
    expect(agg.purchases).toBe(10);
    expect(agg.purchasesSource).toBe("result_purchase_fallback");
  });

  it("CASE 2: 결과=10 + 유형 link_click → 구매로 사용 금지 (원본 열 없음)", () => {
    const { agg, present } = firstAgg(HRES, [{ ...baseRow, "결과": "10", "결과 표시 도구": "link_click" }]);
    expect(present).not.toContain("purchases");
    expect(agg.purchases).toBe(0);
    expect(agg.purchasesSource).toBe("unavailable");
    const g = metricGroupsForAgg(agg, present);
    expect(findMetric(g, "cpa")!.state).toBe("missing_column");
    expect(findMetric(g, "purchaseRate")!.state).toBe("missing_column");
  });

  it("CASE 3: 결과=10 + 결과 유형 비어 있음 → 구매로 사용 금지", () => {
    const { agg, present } = firstAgg(HRES, [{ ...baseRow, "결과": "10", "결과 표시 도구": "" }]);
    expect(present).not.toContain("purchases");
    expect(agg.purchasesSource).toBe("unavailable");
  });

  it("CASE 4: 전용 구매=5 + 결과=10(purchase) → 전용 5 우선, 결과 10 무시", () => {
    const { agg, present } = firstAgg(HRES_PURCH, [
      { ...baseRow, "웹사이트 직접 구매": "5", "결과": "10", "결과 표시 도구": "구매" },
    ]);
    expect(present).toContain("purchases");
    expect(agg.purchases).toBe(5);
    expect(agg.purchasesSource).toBe("direct_purchase_column");
  });

  it("CASE 5: 구매매출 열 없음 + Meta ROAS 있음 → 구매매출 원본 열 없음, Meta ROAS 정상", () => {
    const H = ["광고 이름", "지출 금액 (KRW)", "노출", "구매 ROAS(광고 지출 대비 수익률)", "광고 ID"];
    const { agg, present } = firstAgg(H, [{ "광고 이름": "x", "지출 금액 (KRW)": "50000", "노출": "3000", "구매 ROAS(광고 지출 대비 수익률)": "2.0", "광고 ID": "9" }]);
    expect(present).not.toContain("purchaseValue");
    expect(agg.purchaseValueSource).toBe("unavailable");
    expect(agg.metaRoasSource).toBe("direct_meta_roas_column");
    expect(agg.metaRevenueEst).toBeCloseTo(100000, 0);
  });

  it("CASE 6: 구매매출 열 없음 + Meta ROAS + 광고비 있음 → 구매매출을 역산 생성하지 않음", () => {
    const H = ["광고 이름", "지출 금액 (KRW)", "노출", "구매 ROAS(광고 지출 대비 수익률)", "광고 ID"];
    const { agg, present } = firstAgg(H, [{ "광고 이름": "x", "지출 금액 (KRW)": "10000", "노출": "3000", "구매 ROAS(광고 지출 대비 수익률)": "2.0", "광고 ID": "9" }]);
    expect(agg.purchaseValue).toBe(0); // ROAS×광고비=20000 로 만들지 않음
    expect(present).not.toContain("purchaseValue");
    const g = metricGroupsForAgg(agg, present);
    expect(findMetric(g, "roas")!.state).toBe("missing_column"); // 구매매출 원본 열 없음
  });

  it("CASE 7: 구매 관련 열 없음 + purchase 결과 유형도 없음 → 구매 0이 아니라 원본 열 없음", () => {
    const { agg, present } = firstAgg(HNO, [{ ...baseRow }]);
    expect(present).not.toContain("purchases");
    expect(agg.purchasesSource).toBe("unavailable");
    const g = metricGroupsForAgg(agg, present);
    expect(findMetric(g, "cpa")!.state).toBe("missing_column");
  });

  it("혼합 파일: 광고 A(purchase)=구매 집계, 광고 B(link_click)=원본 열 없음 (파일에 purchase 있다고 B까지 구매 처리 금지)", () => {
    const rows = [
      { "광고 이름": "A", "지출 금액 (KRW)": "50000", "노출": "3000", "링크 클릭": "60", "랜딩 페이지 조회": "50", "결과": "5", "결과 표시 도구": "구매", "광고 ID": "A1" },
      { "광고 이름": "B", "지출 금액 (KRW)": "40000", "노출": "2500", "링크 클릭": "50", "랜딩 페이지 조회": "40", "결과": "20", "결과 표시 도구": "link_click", "광고 ID": "B1" },
    ];
    const ds = buildDataset([parsed(HRES, rows)], [], autoMap(HRES));
    const present = ds.presentPerfFields;
    expect(present).toContain("purchases"); // 파일 전체엔 purchase 근거가 있음
    const a = ds.recordsByKey.get("id:A1")!.cur!;
    const b = ds.recordsByKey.get("id:B1")!.cur!;

    // 광고 A: 결과 5 → 구매 5, cpa/구매전환율 계산 가능
    expect(a.purchases).toBe(5);
    expect(a.purchasesSource).toBe("result_purchase_fallback");
    expect(findMetric(metricGroupsForAgg(a, present), "cpa")!.state).toBe("ok");

    // 광고 B: 결과 20을 구매로 쓰지 않음 → 구매 0, 출처 unavailable, 지표는 '원본 열 없음'
    expect(b.purchases).toBe(0);
    expect(b.purchasesSource).toBe("unavailable");
    const gb = metricGroupsForAgg(b, present);
    expect(findMetric(gb, "cpa")!.state).toBe("missing_column");
    expect(findMetric(gb, "purchaseRate")!.state).toBe("missing_column");
  });

  it("한 광고 안에서 행별 혼합: purchase 행만 합산 (link_click 행 제외)", () => {
    const rows = [
      { "광고 이름": "A", "지출 금액 (KRW)": "10000", "노출": "1000", "링크 클릭": "20", "랜딩 페이지 조회": "18", "결과": "3", "결과 표시 도구": "구매", "보고 시작": "2026-08-10", "보고 종료": "2026-08-10", "광고 ID": "A1" },
      { "광고 이름": "A", "지출 금액 (KRW)": "10000", "노출": "1200", "링크 클릭": "25", "랜딩 페이지 조회": "20", "결과": "40", "결과 표시 도구": "link_click", "보고 시작": "2026-08-11", "보고 종료": "2026-08-11", "광고 ID": "A1" },
    ];
    const H = ["광고 이름", "지출 금액 (KRW)", "노출", "링크 클릭", "랜딩 페이지 조회", "결과", "결과 표시 도구", "보고 시작", "보고 종료", "광고 ID"];
    const ds = buildDataset([parsed(H, rows)], [], autoMap(H));
    const a = ds.recordsByKey.get("id:A1")!.cur!;
    expect(a.purchases).toBe(3); // 구매 행(3)만, link_click 행(40) 제외
    expect(a.purchasesSource).toBe("result_purchase_fallback");
  });

  it("CASE A vs B: 전용 구매 열 있고 값 0 → 실제 구매 0건 (원본 열 없음 아님)", () => {
    const { agg, present } = firstAgg(HRES_PURCH, [
      { ...baseRow, "웹사이트 직접 구매": "0", "결과": "0", "결과 표시 도구": "구매" },
    ]);
    expect(present).toContain("purchases"); // 열이 있으므로 구매는 '원본 근거 있음'
    expect(agg.purchases).toBe(0);
    expect(agg.purchasesSource).toBe("direct_purchase_column");
    const g = metricGroupsForAgg(agg, present);
    expect(findMetric(g, "cpa")!.state).toBe("no_purchase"); // 0원 표기 아님
  });
});
