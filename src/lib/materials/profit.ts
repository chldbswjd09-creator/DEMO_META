// 수익성 판정 — 추정 ROAS(=CSV 구매매출/광고비)와 직접 입력한 BEP ROAS를 비교한다.
// (판매가/원가/배송비로 BEP를 계산하던 로직은 제거되었다.)

export type ProfitVerdict =
  | "BEP 초과"
  | "손익분기"
  | "BEP 미달"
  | "추정 ROAS 계산 불가"
  | "BEP ROAS 입력 필요";
