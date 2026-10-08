// BEP ROAS 계산기 — 순수 계산 로직.
// 참고 대시보드(https://bep-roas-calculator.vercel.app/)의 calculate() 함수를 1:1로 이식했다.
// 결과(공헌이익/손익분기 광고비/BEP ROAS/상세/목표표/시나리오)가 원본과 원·0.1% 단위까지 일치한다.
//
// ⚠️ 이 모듈은 '입력 보조용' 신규 계산기이며, 기존 성과 지표/판정/ROAS 계산 로직과 무관하다.

export type CostVat = "exclusive" | "inclusive"; // 매입원가 부가세: 별도(공급가액) / 포함
export type PromotionType = "single" | "two" | "2+1" | "3+1" | "freeship" | "custom";
export type CustomerShippingMode = "addRevenue" | "offsetCost"; // 고객부담배송비: 매출 가산 / 배송비 상계
export type FeeBase = "after" | "before"; // 결제 수수료 기준: 할인 후 실결제 / 할인 전 주문금액
export type AgencyBase = "none" | "ad" | "revenue"; // 대행 수수료 기준
export type VatMethod = "netOfInput" | "simple"; // 매출세액−매입세액 / 단순 매출세액
export type RoasBasis = "after" | "before" | "withShipping"; // BEP ROAS 산정 매출 기준

export interface BepState {
  productName: string;
  unitPrice: number; // 개당 판매가
  unitCost: number; // 개당 매입원가
  costVatIncluded: boolean; // 매입원가 부가세 포함 여부
  promotionType: PromotionType;
  avgQty: number; // 평균 구매수량(유료)
  freeQty: number; // 무료 증정 수량
  shippingPerOrder: number; // 주문당 배송비
  customerShipping: number; // 고객 부담 배송비
  customerShippingMode: CustomerShippingMode;
  paymentFeeRate: number; // 결제 수수료율 %
  platformFeeRate: number; // 플랫폼 수수료율 %
  paymentFeeBase: FeeBase;
  adAgencyFeeRate: number; // 광고 대행 수수료율 %
  adAgencyFeeBase: AgencyBase;
  instantDiscount: number; // 즉시 할인금액
  couponDiscount: number; // 쿠폰 할인금액
  pointsUsed: number; // 적립금 사용금액
  extraDiscountCost: number; // 할인·적립금 관련 추가 비용
  vatMethod: VatMethod;
  shippingVatDeductible: boolean; // 배송비·기타비용 매입세액 공제
  otherVariableCost: number; // 기타 변동비(주문당)
  roasRevenueBasis: RoasBasis;
  targetRoasListRaw: string; // 목표 ROAS 목록(콤마 구분)
}

export interface TargetRow {
  target: number; // 목표 ROAS %
  adCost: number; // 예상 광고비
  profit: number; // 예상 순이익
  profitRate: number | null; // 예상 이익률 %
}

export interface BepResult {
  avgQty: number;
  freeQty: number;
  totalQty: number;
  orderRevenue: number;
  actualPayment: number;
  totalProductCost: number;
  realShipping: number;
  paymentFee: number;
  platformFee: number;
  outputVat: number;
  inputVat: number;
  netVat: number;
  contributionMarginPreAd: number;
  bepAdCost: number;
  bepValid: boolean;
  bepRoas: number | null;
  perUnitProfit: number | null;
  orderProfitRate: number | null;
  targets: TargetRow[];
  roasRevenue: number;
  target300Profit: number;
}

// 참고 원본과 동일: parseFloat 후 유한수 아니면 0 (음수 클램프 없음)
function n(v: number | string | null | undefined): number {
  const f = parseFloat(String(v));
  return isFinite(f) ? f : 0;
}

export function defaultState(): BepState {
  return {
    productName: "제품명",
    unitPrice: 20000,
    unitCost: 6000,
    costVatIncluded: false,
    promotionType: "single",
    avgQty: 1.64,
    freeQty: 0,
    shippingPerOrder: 3000,
    customerShipping: 0,
    customerShippingMode: "addRevenue",
    paymentFeeRate: 2.5,
    platformFeeRate: 0,
    paymentFeeBase: "after",
    adAgencyFeeRate: 10,
    adAgencyFeeBase: "ad",
    instantDiscount: 0,
    couponDiscount: 0,
    pointsUsed: 0,
    extraDiscountCost: 0,
    vatMethod: "netOfInput",
    shippingVatDeductible: true,
    otherVariableCost: 0,
    roasRevenueBasis: "after",
    targetRoasListRaw: "200,250,300,350,400",
  };
}

// 프로모션 프리셋 — 선택 시 유료/무료 수량(또는 고객배송비)을 세팅
export const promotionPresets: Record<string, Partial<BepState>> = {
  single: { avgQty: 1, freeQty: 0 },
  two: { avgQty: 2, freeQty: 0 },
  "2+1": { avgQty: 2, freeQty: 1 },
  "3+1": { avgQty: 3, freeQty: 1 },
  freeship: { customerShipping: 0 },
};

export function parseTargetList(raw: string): number[] {
  return (raw || "")
    .split(",")
    .map((s) => parseFloat(s.trim()))
    .filter((x) => isFinite(x) && x > 0);
}

// 참고 대시보드 calculate() 1:1 이식
export function calculate(s: BepState): BepResult {
  const avgQty = n(s.avgQty);
  const freeQty = n(s.freeQty);
  const totalQty = avgQty + freeQty; // 총 출고수량 = 유료 + 무료 증정

  const orderRevenue = n(s.unitPrice) * avgQty; // 주문 매출(무료 증정분 제외)

  const shipToRevenue = s.customerShippingMode === "addRevenue" ? n(s.customerShipping) : 0;
  const actualPayment =
    Math.max(0, orderRevenue - n(s.instantDiscount) - n(s.couponDiscount) - n(s.pointsUsed)) + shipToRevenue;

  const totalProductCost = n(s.unitCost) * totalQty; // 무료 증정 제품도 원가 포함

  const realShipping =
    s.customerShippingMode === "offsetCost"
      ? Math.max(0, n(s.shippingPerOrder) - n(s.customerShipping))
      : n(s.shippingPerOrder);

  const paymentFeeBaseAmt = s.paymentFeeBase === "before" ? orderRevenue : actualPayment;
  const paymentFee = paymentFeeBaseAmt * (n(s.paymentFeeRate) / 100);
  const platformFee = actualPayment * (n(s.platformFeeRate) / 100);

  // 부가세
  const outputVat = actualPayment / 11;
  let inputVat = 0;
  let netVat: number;
  if (s.vatMethod === "simple") {
    netVat = outputVat;
  } else {
    let unitInputVat: number;
    if (s.costVatIncluded) {
      const unitSupply = n(s.unitCost) / 1.1;
      unitInputVat = n(s.unitCost) - unitSupply;
    } else {
      unitInputVat = n(s.unitCost) * 0.1;
    }
    const productInputVat = unitInputVat * totalQty;
    const otherInputVat = s.shippingVatDeductible ? (realShipping + n(s.otherVariableCost)) / 11 : 0;
    inputVat = productInputVat + otherInputVat;
    netVat = outputVat - inputVat;
  }

  // 광고비 차감 전 공헌이익
  const contributionMarginPreAd =
    actualPayment -
    totalProductCost -
    realShipping -
    paymentFee -
    platformFee -
    n(s.extraDiscountCost) -
    netVat -
    n(s.otherVariableCost);

  const rate = n(s.adAgencyFeeRate) / 100;
  let bepAdCost: number;
  if (s.adAgencyFeeBase === "none") {
    bepAdCost = contributionMarginPreAd;
  } else if (s.adAgencyFeeBase === "ad") {
    // 대행 = 광고비의 rate% → 손익분기 광고비 = 공헌이익 / (1+rate)
    bepAdCost = contributionMarginPreAd / (1 + rate);
  } else {
    const agencyFeeOnRevenue = actualPayment * rate;
    bepAdCost = contributionMarginPreAd - agencyFeeOnRevenue;
  }

  let roasRevenue: number;
  if (s.roasRevenueBasis === "before") roasRevenue = orderRevenue;
  else if (s.roasRevenueBasis === "withShipping")
    roasRevenue = actualPayment + (s.customerShippingMode === "offsetCost" ? n(s.customerShipping) : 0);
  else roasRevenue = actualPayment;

  const bepValid = isFinite(bepAdCost) && bepAdCost > 0;
  const bepRoas = bepValid ? (roasRevenue / bepAdCost) * 100 : null;

  const perUnitProfit = totalQty > 0 ? contributionMarginPreAd / totalQty : null;
  const orderProfitRate = actualPayment > 0 ? (contributionMarginPreAd / actualPayment) * 100 : null;

  const targetList = parseTargetList(s.targetRoasListRaw);
  const targets: TargetRow[] = targetList.map((t) => {
    const dec = t / 100;
    const adCost = roasRevenue / dec;
    let agencyFee = 0;
    if (s.adAgencyFeeBase === "ad") agencyFee = adCost * rate;
    else if (s.adAgencyFeeBase === "revenue") agencyFee = actualPayment * rate;
    const profit = contributionMarginPreAd - adCost - agencyFee;
    const profitRate = roasRevenue > 0 ? (profit / roasRevenue) * 100 : null;
    return { target: t, adCost, profit, profitRate };
  });

  // 목표 300% 기준 이익(시나리오 비교 열 전용)
  const t300adCost = roasRevenue / 3;
  const t300agencyFee =
    s.adAgencyFeeBase === "ad" ? t300adCost * rate : s.adAgencyFeeBase === "revenue" ? actualPayment * rate : 0;
  const target300Profit = contributionMarginPreAd - t300adCost - t300agencyFee;

  return {
    avgQty,
    freeQty,
    totalQty,
    orderRevenue,
    actualPayment,
    totalProductCost,
    realShipping,
    paymentFee,
    platformFee,
    outputVat,
    inputVat,
    netVat,
    contributionMarginPreAd,
    bepAdCost,
    bepValid,
    bepRoas,
    perUnitProfit,
    orderProfitRate,
    targets,
    roasRevenue,
    target300Profit,
  };
}

// 시나리오: 메인 입력에 overrides를 덮어 계산
export interface Scenario {
  id: number;
  name: string;
  overrides: Partial<BepState>;
}

export function defaultScenarios(): Scenario[] {
  return [
    { id: 1, name: "판매가 18,000원", overrides: { unitPrice: 18000 } },
    { id: 2, name: "판매가 20,000원", overrides: { unitPrice: 20000 } },
    { id: 3, name: "판매가 22,000원", overrides: { unitPrice: 22000 } },
    { id: 4, name: "적립금 3,000원 사용", overrides: { unitPrice: 20000, pointsUsed: 3000 } },
    { id: 5, name: "3+1 프로모션", overrides: { unitPrice: 20000, promotionType: "3+1", avgQty: 3, freeQty: 1 } },
  ];
}

export function scenarioResult(base: BepState, sc: Scenario): BepResult {
  return calculate({ ...base, ...sc.overrides });
}

export const ROAS_BASIS_LABELS: Record<RoasBasis, string> = {
  before: "할인 전 주문 매출",
  after: "할인 후 실결제금액",
  withShipping: "고객 부담 배송비 포함 결제금액",
};
