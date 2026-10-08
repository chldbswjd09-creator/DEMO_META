// 구매 관련 값의 '안전한 원본 근거' 판별 — 임의 생성/역산 금지 원칙을 구현한다.
//
// 핵심: 원본 CSV에 없는 숫자를 만들지 않는다.
//  - 구매 건수는 전용 구매 열이 1순위, 없을 때만 '결과(purchase 유형)' 를 fallback 으로 사용.
//  - '결과' 열이 있다는 이유만으로 구매로 쓰지 않는다. 반드시 같은 행의 '결과 표시 도구'가
//    purchase 임이 명확해야 한다.
//  - 근거가 없으면 구매 = 원본 열 없음(unavailable). 0으로 만들지 않는다.

import type { PurchasesSource } from "@/lib/types";
import { normalizeHeader } from "@/lib/csv/columnMap";

// '결과 표시 도구'(또는 결과 유형) 값이 명확한 구매 이벤트인지 보수적으로 판정.
// 허용: offsite_conversion.fb_pixel_purchase / fb_pixel_purchase / 웹사이트 구매 / 구매 등.
// 거부: link_click / landing_page_view / lead / engagement / message / view / 장바구니 / 결제 시작 / 빈 값.
export function isPurchaseResultType(indicator: string | null | undefined): boolean {
  if (indicator == null) return false;
  const s = normalizeHeader(indicator); // 소문자·공백 정규화
  if (s === "") return false;
  // 구매가 명확히 포함된 경우만 인정 (purchase / 구매)
  if (!/purchase|구매/.test(s)) return false;
  // 구매 '이전' 단계(장바구니/결제 시작)는 purchase 라는 단어가 없더라도 방어적으로 제외.
  // (purchase 자체가 포함되지 않으므로 대부분 위에서 이미 걸러지지만, 안전장치로 유지)
  if (/add[_\s]?to[_\s]?cart|장바구니|initiate[_\s]?checkout|결제\s*시작/.test(s)) return false;
  return true;
}

// 행 단위 구매 건수 해석 컨텍스트 (열 존재 여부).
export interface PurchaseColsCtx {
  hasPurchaseColumn: boolean; // 전용 구매 건수 열이 매핑됨
  hasResultColumn: boolean; // '결과' 열이 매핑됨
  hasResultIndicatorColumn: boolean; // '결과 표시 도구' 열이 매핑됨
}

export interface RowPurchaseCells {
  purchaseCell?: string; // 전용 구매 열 값 (문자열 원본)
  resultCell?: string; // '결과' 열 값
  indicatorCell?: string; // '결과 표시 도구' 값
}

export interface RowPurchaseResult {
  count: number | null; // null = 이 행은 구매 근거 없음(합산 대상 아님)
  source: PurchasesSource;
}

function toNum(raw: string | undefined): number {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (s === "" || s === "-" || s === "—") return 0;
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// 한 행의 구매 건수를 우선순위에 따라 해석한다.
//  1순위: 전용 구매 열 → 원본값 그대로 (열이 있으면 빈 값=0, 이것은 '실제 0'과 동일 취급)
//  2순위: 전용 구매 열이 없고 '결과' + '결과 표시 도구'가 있으며 purchase 유형일 때만 '결과' 사용
//  그 외: null(근거 없음) — 합산하지 않는다.
export function rowPurchases(ctx: PurchaseColsCtx, cells: RowPurchaseCells): RowPurchaseResult {
  if (ctx.hasPurchaseColumn) {
    return { count: toNum(cells.purchaseCell), source: "direct_purchase_column" };
  }
  if (ctx.hasResultColumn && ctx.hasResultIndicatorColumn && isPurchaseResultType(cells.indicatorCell)) {
    return { count: toNum(cells.resultCell), source: "result_purchase_fallback" };
  }
  return { count: null, source: "unavailable" };
}

// 출처 우선순위 병합 (합산 시 더 확실한 출처를 유지).
const PURCH_RANK: Record<PurchasesSource, number> = {
  direct_purchase_column: 3,
  result_purchase_fallback: 2,
  unavailable: 1,
};
export function mergePurchasesSource(a: PurchasesSource, b: PurchasesSource): PurchasesSource {
  return PURCH_RANK[a] >= PURCH_RANK[b] ? a : b;
}
