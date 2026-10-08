import { describe, it, expect } from "vitest";
import { autoMap } from "@/lib/csv/mapping";
import { buildDataset } from "@/lib/csv/dataset";
import { metricGroupsForAgg } from "@/lib/materials/compute";
import { findMetric } from "@/lib/metrics/calc";
import type { ParsedFile } from "@/lib/csv/parse";

// 실제 Meta CSV(쥬스박스) 헤더 — '웹사이트 직접 구매'(건수) / '전환값'(매출) / '구매 ROAS'(수익률) / '결과' 계열이 섞여 있다.
const HEADERS = [
  "광고 이름", "광고 게재", "지출 금액 (KRW)", "노출", "도달", "빈도",
  "CPM(1,000회 노출당 비용) (KRW)", "링크 클릭", "CTR(전체)", "CPC(전체) (KRW)",
  "랜딩 페이지 조회", "랜딩 페이지 조회당 비용 (KRW)",
  "웹사이트 직접 구매", "웹사이트 직접 구매 전환값", "구매 ROAS(광고 지출 대비 수익률)",
  "동영상 3초 이상 재생", "동영상 50% 재생", "동영상 100% 재생",
  "보고 시작", "보고 종료", "기여 설정",
  "결과", "결과 표시 도구", "결과당 비용", "결과 ROAS", "결과 ROAS 표시 도구", "광고 ID",
];

// 실제 0731_video_1 값 (사용자가 보고한 깨진 화면의 원본)
const ROW: Record<string, string> = {
  "광고 이름": "0731_video_1", "광고 게재": "active", "지출 금액 (KRW)": "51995",
  "노출": "1913", "도달": "1709", "링크 클릭": "34", "랜딩 페이지 조회": "32",
  "웹사이트 직접 구매": "1", "웹사이트 직접 구매 전환값": "14700",
  "구매 ROAS(광고 지출 대비 수익률)": "0.282719",
  "결과": "1", "결과당 비용": "51995", "결과 ROAS": "0.28271949", "광고 ID": "120253677535510581",
  "보고 시작": "2026-08-06", "보고 종료": "2026-08-06",
};

function parsed(rows: Record<string, string>[]): ParsedFile {
  return { fileName: "쥬스박스.csv", fileSize: 1000, encoding: "utf-8", delimiter: ",", headers: HEADERS, rows, rowCount: rows.length };
}

describe("구매 계열 열 매핑 — 상호 오염 방지", () => {
  it("웹사이트 직접 구매(건수) / 전환값(매출) / 구매 ROAS 를 정확히 분리", () => {
    const m = autoMap(HEADERS);
    expect(m.purchases.header).toBe("웹사이트 직접 구매");
    expect(m.purchaseValue.header).toBe("웹사이트 직접 구매 전환값");
    expect(m.purchaseRoas.header).toBe("구매 ROAS(광고 지출 대비 수익률)");
    expect(m.landingPageViews.header).toBe("랜딩 페이지 조회");
    // 매출/수익률/비용 열은 절대 purchases 로 잡히지 않는다
    expect(m.purchases.header).not.toBe("웹사이트 직접 구매 전환값");
    expect(m.purchases.header).not.toBe("구매 ROAS(광고 지출 대비 수익률)");
    expect(m.purchases.header).not.toBe("결과당 비용");
  });

  it("정상 지표: 구매전환율/CPA (깨진 45,937% / 4원 이 아님)", () => {
    const ds = buildDataset([parsed([ROW])], [], autoMap(HEADERS));
    const rec = [...ds.recordsByKey.values()][0];
    const agg = rec.cur!;
    expect(agg.spend).toBe(51995);
    expect(agg.purchases).toBe(1); // 14700(매출) 아님
    expect(agg.purchaseValue).toBe(14700);
    expect(agg.landingPageViews).toBe(32);

    const g = metricGroupsForAgg(agg, ds.presentPerfFields);
    expect(findMetric(g, "purchaseRate")!.current).toBeCloseTo(3.125, 3); // 1/32*100
    expect(findMetric(g, "cpa")!.current).toBeCloseTo(51995, 0); // 51995/1
  });

  it("Supabase 저장 왕복(JSON round-trip) 후에도 값이 동일 (A = C)", () => {
    const mapping = autoMap(HEADERS);
    const before = buildDataset([parsed([ROW])], [], mapping);
    const aggA = [...before.recordsByKey.values()][0].cur!;

    // 저장/복원 시뮬레이션: JSON 직렬화 → 역직렬화
    const roundTrip = JSON.parse(JSON.stringify({ headers: HEADERS, rows: [ROW], mapping }));
    const after = buildDataset([parsed(roundTrip.rows)], [], roundTrip.mapping);
    const aggC = [...after.recordsByKey.values()][0].cur!;

    for (const k of ["spend", "impressions", "reach", "linkClicks", "landingPageViews", "purchases", "purchaseValue"] as const) {
      expect(aggC[k]).toBe(aggA[k]);
    }
  });
});

describe("구매 계열 회귀 케이스", () => {
  const map = () => autoMap(HEADERS);
  it("구매 0건 + LPV 정상 → 구매전환율 0.0%, CPA 구매 없음", () => {
    const row = { ...ROW, "웹사이트 직접 구매": "0", "웹사이트 직접 구매 전환값": "0" };
    const ds = buildDataset([parsed([row])], [], map());
    const g = metricGroupsForAgg([...ds.recordsByKey.values()][0].cur!, ds.presentPerfFields);
    expect(findMetric(g, "purchaseRate")!.current).toBe(0);
    expect(findMetric(g, "cpa")!.state).toBe("no_purchase");
  });
  it("LPV 0 → 구매전환율 계산 불가", () => {
    const row = { ...ROW, "랜딩 페이지 조회": "0" };
    const ds = buildDataset([parsed([row])], [], map());
    const g = metricGroupsForAgg([...ds.recordsByKey.values()][0].cur!, ds.presentPerfFields);
    expect(findMetric(g, "purchaseRate")!.state).toBe("cannot_calc");
  });
  it("purchases 열 자체가 없으면 구매전환율/CPA 계산 불가(missing_column)", () => {
    const headersNoPurch = HEADERS.filter((h) => h !== "웹사이트 직접 구매");
    const rowNoPurch = { ...ROW };
    delete rowNoPurch["웹사이트 직접 구매"];
    const pf: ParsedFile = { ...parsed([rowNoPurch]), headers: headersNoPurch };
    const ds = buildDataset([pf], [], autoMap(headersNoPurch));
    const g = metricGroupsForAgg([...ds.recordsByKey.values()][0].cur!, ds.presentPerfFields);
    expect(findMetric(g, "purchaseRate")!.state).toBe("missing_column");
    expect(findMetric(g, "cpa")!.state).toBe("missing_column");
  });
});
