import { describe, it, expect } from "vitest";
import { decodeBuffer, detectDelimiter, parseCsvText } from "@/lib/csv/parse";
import { autoMap, validateMapping, emptyMapping } from "@/lib/csv/mapping";
import { buildDataset } from "@/lib/csv/dataset";
import { analyzeAdCsv, listAdRows, contributionsForAd } from "@/lib/csv/analyze";
import { findMetric } from "@/lib/metrics/calc";
import { DEFAULT_SETTINGS } from "@/lib/verdict/settings";

// ── 파싱 ──────────────────────────────────────────────────────
describe("CSV 파싱", () => {
  it("쉼표/탭 구분자 자동 감지", () => {
    expect(detectDelimiter("a,b,c\n1,2,3")).toBe(",");
    expect(detectDelimiter("a\tb\tc\n1\t2\t3")).toBe("\t");
  });

  it("UTF-8 / BOM 디코딩 (BOM 제거)", () => {
    const enc = new TextEncoder();
    const plain = enc.encode("노출,도달\n1,2");
    expect(decodeBuffer(plain.buffer).encoding).toBe("utf-8");
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode("노출")]);
    const d = decodeBuffer(bom.buffer);
    expect(d.encoding).toBe("utf-8-bom");
    expect(d.text.startsWith("노출")).toBe(true);
  });

  it("CP949/EUC-KR 디코딩 (가나다)", () => {
    const euckr = new Uint8Array([0xb0, 0xa1, 0xb3, 0xaa, 0xb4, 0xd9]); // 가나다
    const d = decodeBuffer(euckr.buffer);
    expect(d.encoding).toBe("euc-kr");
    expect(d.text).toBe("가나다");
  });

  it("헤더/행 파싱 + 따옴표 처리", () => {
    const p = parseCsvText('광고 이름,노출\n"광고,A",100\n광고B,200', { fileName: "t.csv", fileSize: 10 });
    expect(p.headers).toEqual(["광고 이름", "노출"]);
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0]["광고 이름"]).toBe("광고,A");
  });
});

// ── 매핑 ──────────────────────────────────────────────────────
describe("열 자동 매핑", () => {
  it("한국어 헤더 매핑", () => {
    const m = autoMap(["광고 이름", "캠페인 이름", "광고세트 이름", "지출 금액", "노출", "도달", "링크 클릭", "구매", "구매 전환값", "3초 이상 동영상 재생"]);
    expect(m.adName.header).toBe("광고 이름");
    expect(m.campaignName.header).toBe("캠페인 이름");
    expect(m.spend.header).toBe("지출 금액");
    expect(m.impressions.header).toBe("노출");
    expect(m.reach.header).toBe("도달");
    expect(m.linkClicks.header).toBe("링크 클릭");
    expect(m.purchaseValue.header).toBe("구매 전환값");
    expect(m.video3s.header).toBe("3초 이상 동영상 재생");
  });

  it("영어 헤더 + 통화 접미사 매핑", () => {
    const m = autoMap(["Ad name", "Campaign name", "Ad set name", "Amount spent (KRW)", "Impressions", "Reach", "Link clicks", "Purchases", "Website purchases conversion value"]);
    expect(m.adName.header).toBe("Ad name");
    expect(m.spend.header).toBe("Amount spent (KRW)");
    expect(m.purchaseValue.header).toBe("Website purchases conversion value");
  });

  it("성과 열이 없어도 저장 가능(광고만 필수), 중복 검증은 동작", () => {
    // 광고 이름만 있고 성과 열 없음 → 필수 누락 없음(저장 가능)
    const m = autoMap(["광고 이름"]);
    expect(validateMapping(m).missingRequired).toHaveLength(0);

    const dup = emptyMapping();
    dup.spend = { header: "X", confidence: 1, auto: false };
    dup.impressions = { header: "X", confidence: 1, auto: false };
    expect(validateMapping(dup).duplicateHeaders).toHaveLength(1);
  });
});

describe("매핑 규칙 — 구매 ROAS 분리 & 식별 필수 완화", () => {
  it("'구매 ROAS'는 구매/구매매출이 아니라 purchaseRoas 필드로 매핑", () => {
    const m = autoMap(["광고 이름", "광고 ID", "지출 금액", "노출", "도달", "구매", "구매 전환값", "구매 ROAS"]);
    expect(m.purchases.header).toBe("구매");
    expect(m.purchaseValue.header).toBe("구매 전환값");
    expect(m.purchaseRoas.header).toBe("구매 ROAS");
    expect(m.purchases.header).not.toBe("구매 ROAS");
    expect(m.purchaseValue.header).not.toBe("구매 ROAS");
  });

  it("영어 'Purchase ROAS'도 purchaseRoas로 매핑(구매/구매매출 아님)", () => {
    const m = autoMap(["Ad name", "Purchases", "Purchase ROAS", "Website purchases conversion value", "Amount spent", "Impressions", "Reach"]);
    expect(m.purchases.header).toBe("Purchases");
    expect(m.purchaseValue.header).toBe("Website purchases conversion value");
    expect(m.purchaseRoas.header).toBe("Purchase ROAS");
  });

  it("ROAS 열만 있으면 구매/구매매출은 '매핑 안 함' 유지", () => {
    const m = autoMap(["광고 이름", "지출 금액", "노출", "도달", "구매 ROAS", "광고 지출 대비 수익률"]);
    expect(m.purchases.header).toBeNull();
    expect(m.purchaseValue.header).toBeNull();
  });

  it("캠페인·광고세트·광고계정은 선택 사항 (광고+광고비·노출·도달만 있으면 유효)", () => {
    const v = validateMapping(autoMap(["광고 이름", "지출 금액", "노출", "도달"]));
    expect(v.missingRequired).toHaveLength(0);
    expect(v.ok).toBe(true);
  });

  it("광고 이름/ID가 모두 없으면 필수 누락", () => {
    const m = emptyMapping();
    m.spend = { header: "지출 금액", confidence: 1, auto: false };
    m.impressions = { header: "노출", confidence: 1, auto: false };
    m.reach = { header: "도달", confidence: 1, auto: false };
    expect(validateMapping(m).missingRequired.map((x) => x.group)).toContain("ad");
  });

  it("광고 ID 없이 광고 이름만 있어도 유효 (분석 허용)", () => {
    const v = validateMapping(autoMap(["광고 이름", "지출 금액", "노출", "도달"]));
    expect(v.ok).toBe(true);
  });
});

// ── 데이터셋: 병합/중복/매칭 ──────────────────────────────────
const HEADER = "Ad name,Campaign name,Ad set name,Ad ID,Amount spent,Impressions,Reach,Link clicks,Landing page views,Purchases,Website purchases conversion value";
const CURRENT = `${HEADER}
AdA,Camp1,Set1,111,100000,50000,25000,1000,800,20,800000
AdB,Camp1,Set1,222,50000,20000,10000,300,200,5,150000`;
const PREVIOUS = `${HEADER}
AdA,Camp1,Set1,111,90000,45000,24000,900,700,25,900000
AdC,Camp1,Set1,333,40000,15000,8000,200,150,3,80000`;

function parse(text: string) {
  return parseCsvText(text, { fileName: "f.csv", fileSize: text.length });
}

describe("데이터셋 병합 & 현재/이전 매칭", () => {
  const cur = parse(CURRENT);
  const prev = parse(PREVIOUS);
  const mapping = autoMap(cur.headers);
  const ds = buildDataset([cur], [prev], mapping);

  it("매칭 상태: 정상/신규/이전만", () => {
    expect(ds.counts.matched).toBe(1); // AdA
    expect(ds.counts.currentOnly).toBe(1); // AdB
    expect(ds.counts.previousOnly).toBe(1); // AdC
    expect(ds.recordsByKey.get("id:111")?.match).toBe("matched");
    expect(ds.recordsByKey.get("id:222")?.match).toBe("current_only");
    expect(ds.recordsByKey.get("id:333")?.match).toBe("previous_only");
  });

  it("이전 기간에만 존재하는 광고는 기본 목록에서 숨김", () => {
    const setKey = ds.recordsByKey.get("id:111")!.adSetKey;
    const rows = listAdRows(ds, setKey, DEFAULT_SETTINGS);
    const ids = rows.map((r) => r.id);
    expect(ids).toContain("id:111");
    expect(ids).toContain("id:222");
    expect(ids).not.toContain("id:333"); // previous_only 숨김
    // 필터 켜면 포함
    expect(listAdRows(ds, setKey, DEFAULT_SETTINGS, true).map((r) => r.id)).toContain("id:333");
  });

  it("동일 중복 행은 병합에서 제외 (이중 집계 방지)", () => {
    const dupText = `${CURRENT}\nAdA,Camp1,Set1,111,100000,50000,25000,1000,800,20,800000`;
    const ds2 = buildDataset([parse(dupText)], [], mapping);
    expect(ds2.recordsByKey.get("id:111")?.cur?.spend).toBe(100000); // 두 배 아님
    expect(ds2.counts.duplicatesSkipped).toBeGreaterThan(0);
  });
});

// ── 분석: 지표 + 신규 + 원본 열 없음 ─────────────────────────
describe("CSV 분석", () => {
  const cur = parse(CURRENT);
  const prev = parse(PREVIOUS);
  const mapping = autoMap(cur.headers);
  const ds = buildDataset([cur], [prev], mapping);

  it("지표 계산이 정확하다 (AdA)", () => {
    const a = analyzeAdCsv(ds, "id:111", DEFAULT_SETTINGS)!;
    expect(findMetric(a.groups, "cpm")!.current).toBe(2000);
    expect(findMetric(a.groups, "ctr")!.current).toBe(2);
    expect(findMetric(a.groups, "roas")!.current).toBe(800);
    expect(a.hasPrevData).toBe(true);
  });

  it("신규 광고 표시 (현재에만 존재)", () => {
    expect(analyzeAdCsv(ds, "id:222", DEFAULT_SETTINGS)!.isNew).toBe(true);
    expect(analyzeAdCsv(ds, "id:111", DEFAULT_SETTINGS)!.isNew).toBe(false);
  });

  it("원본 열이 없으면 해당 지표는 'missing_column'", () => {
    const mNoLanding = autoMap(cur.headers);
    mNoLanding.landingPageViews = { header: null, confidence: 0, auto: false };
    const ds2 = buildDataset([cur], [prev], mNoLanding);
    const a = analyzeAdCsv(ds2, "id:111", DEFAULT_SETTINGS)!;
    expect(findMetric(a.groups, "landingRate")!.state).toBe("missing_column");
    expect(findMetric(a.groups, "purchaseRate")!.state).toBe("missing_column");
    expect(a.missingDiagnoses.length).toBeGreaterThan(0);
    // 광고비/노출 기반 지표는 여전히 계산됨
    expect(findMetric(a.groups, "cpm")!.state).toBe("ok");
  });

  it("기여도: 동일 광고세트 범위", () => {
    const c = contributionsForAd(ds, "id:111").adset;
    // 세트 총 광고비 = 100000 + 50000 = 150000, AdA 비중 = 66.7%
    expect(c.spendShare).toBeCloseTo(66.666, 1);
  });
});
