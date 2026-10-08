"use client";

// BEP ROAS 계산기 모달 — BEP ROAS 입력칸 옆 '계산하기' 버튼으로 연다.
// 참고 대시보드(bep-roas-calculator.vercel.app)의 모든 입력/결과(상세·목표표·시나리오)를 그대로 재현하며,
// 계산된 BEP ROAS를 '이 값 적용'으로 입력칸(onApply)에 넣는다. 기존 성과/판정 계산과는 독립적이다.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  calculate,
  defaultScenarios,
  defaultState,
  promotionPresets,
  scenarioResult,
  ROAS_BASIS_LABELS,
  type AgencyBase,
  type BepState,
  type CustomerShippingMode,
  type FeeBase,
  type PromotionType,
  type RoasBasis,
  type Scenario,
  type VatMethod,
} from "@/lib/materials/bepCalc";
import { cn } from "@/lib/cn";

function won(v: number | null): string {
  if (v === null || v === undefined || !isFinite(v)) return "-";
  const sign = v < 0 ? "-" : "";
  return sign + Math.round(Math.abs(v)).toLocaleString("ko-KR") + "원";
}
function pct(v: number | null, digits = 1): string {
  if (v === null || v === undefined || !isFinite(v)) return "-";
  return v.toFixed(digits) + "%";
}
function qtyText(v: number): string {
  return v.toLocaleString("ko-KR", { maximumFractionDigits: 2 }) + "개";
}
function num(s: string): number {
  const f = parseFloat(String(s));
  return isFinite(f) ? f : 0;
}
function toneClass(v: number | null): string {
  if (v === null || v === undefined || !isFinite(v)) return "text-slate-400";
  return v > 0 ? "text-emerald-600" : v < 0 ? "text-rose-600" : "text-slate-800";
}

// 숫자 필드는 자유 입력을 위해 문자열로 보관
type NumKey =
  | "unitPrice" | "unitCost" | "avgQty" | "freeQty" | "shippingPerOrder" | "customerShipping"
  | "paymentFeeRate" | "platformFeeRate" | "adAgencyFeeRate" | "instantDiscount" | "couponDiscount"
  | "pointsUsed" | "extraDiscountCost" | "otherVariableCost";

interface Form {
  productName: string;
  unitPrice: string; unitCost: string; avgQty: string; freeQty: string;
  shippingPerOrder: string; customerShipping: string;
  paymentFeeRate: string; platformFeeRate: string; adAgencyFeeRate: string;
  instantDiscount: string; couponDiscount: string; pointsUsed: string;
  extraDiscountCost: string; otherVariableCost: string;
  costVatIncluded: boolean;
  promotionType: PromotionType;
  customerShippingMode: CustomerShippingMode;
  paymentFeeBase: FeeBase;
  adAgencyFeeBase: AgencyBase;
  vatMethod: VatMethod;
  shippingVatDeductible: boolean;
  roasRevenueBasis: RoasBasis;
  targetRoasListRaw: string;
}

function initForm(): Form {
  const d = defaultState();
  return {
    productName: d.productName,
    unitPrice: String(d.unitPrice), unitCost: String(d.unitCost), avgQty: String(d.avgQty), freeQty: String(d.freeQty),
    shippingPerOrder: String(d.shippingPerOrder), customerShipping: String(d.customerShipping),
    paymentFeeRate: String(d.paymentFeeRate), platformFeeRate: String(d.platformFeeRate), adAgencyFeeRate: String(d.adAgencyFeeRate),
    instantDiscount: String(d.instantDiscount), couponDiscount: String(d.couponDiscount), pointsUsed: String(d.pointsUsed),
    extraDiscountCost: String(d.extraDiscountCost), otherVariableCost: String(d.otherVariableCost),
    costVatIncluded: d.costVatIncluded,
    promotionType: d.promotionType,
    customerShippingMode: d.customerShippingMode,
    paymentFeeBase: d.paymentFeeBase,
    adAgencyFeeBase: d.adAgencyFeeBase,
    vatMethod: d.vatMethod,
    shippingVatDeductible: d.shippingVatDeductible,
    roasRevenueBasis: d.roasRevenueBasis,
    targetRoasListRaw: d.targetRoasListRaw,
  };
}

function toState(f: Form): BepState {
  return {
    productName: f.productName,
    unitPrice: num(f.unitPrice), unitCost: num(f.unitCost), avgQty: num(f.avgQty), freeQty: num(f.freeQty),
    shippingPerOrder: num(f.shippingPerOrder), customerShipping: num(f.customerShipping),
    paymentFeeRate: num(f.paymentFeeRate), platformFeeRate: num(f.platformFeeRate), adAgencyFeeRate: num(f.adAgencyFeeRate),
    instantDiscount: num(f.instantDiscount), couponDiscount: num(f.couponDiscount), pointsUsed: num(f.pointsUsed),
    extraDiscountCost: num(f.extraDiscountCost), otherVariableCost: num(f.otherVariableCost),
    costVatIncluded: f.costVatIncluded,
    promotionType: f.promotionType,
    customerShippingMode: f.customerShippingMode,
    paymentFeeBase: f.paymentFeeBase,
    adAgencyFeeBase: f.adAgencyFeeBase,
    vatMethod: f.vatMethod,
    shippingVatDeductible: f.shippingVatDeductible,
    roasRevenueBasis: f.roasRevenueBasis,
    targetRoasListRaw: f.targetRoasListRaw,
  };
}

const inputCls =
  "w-full rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm text-slate-800 outline-none focus:border-brand";
const selectCls =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 outline-none focus:border-brand";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
    </label>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={cn("tabular-nums", strong ? "font-bold" : "font-medium", tone ?? "text-slate-800")}>{value}</span>
    </div>
  );
}

export function BepRoasCalculator({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (bepRoasPct: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [f, setF] = useState<Form>(initForm);
  const [scenarios, setScenarios] = useState<Scenario[]>(defaultScenarios);
  const [seq, setSeq] = useState(6);
  const [showScenarios, setShowScenarios] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const state = useMemo(() => toState(f), [f]);
  const r = useMemo(() => calculate(state), [state]);

  const scRows = useMemo(() => {
    const rows = scenarios.map((sc) => ({ sc, res: scenarioResult(state, sc) }));
    const valid = rows.filter((x) => x.res.bepRoas !== null).map((x) => x.res.bepRoas as number);
    const minRoas = valid.length ? Math.min(...valid) : null;
    return { rows, minRoas };
  }, [scenarios, state]);

  if (!open || !mounted) return null;

  const setNum = (key: NumKey, v: string) => setF((s) => ({ ...s, [key]: v }));
  const setVal = <K extends keyof Form>(key: K, v: Form[K]) => setF((s) => ({ ...s, [key]: v }));

  const onPromotion = (v: PromotionType) => {
    setF((s) => {
      const next: Form = { ...s, promotionType: v };
      const preset = promotionPresets[v];
      if (preset) {
        if (preset.avgQty !== undefined) next.avgQty = String(preset.avgQty);
        if (preset.freeQty !== undefined) next.freeQty = String(preset.freeQty);
        if (preset.customerShipping !== undefined) next.customerShipping = String(preset.customerShipping);
      }
      return next;
    });
  };

  const canApply = r.bepValid && r.bepRoas != null;

  // 시나리오 override 편집
  const editScenario = (id: number, field: "name" | "unitPrice" | "promotionType" | "pointsUsed" | "customerShipping", value: string) => {
    setScenarios((list) =>
      list.map((sc) => {
        if (sc.id !== id) return sc;
        if (field === "name") return { ...sc, name: value };
        const ov = { ...sc.overrides };
        if (field === "promotionType") {
          ov.promotionType = value as PromotionType;
          const preset = promotionPresets[value];
          if (preset) Object.assign(ov, preset);
        } else if (value === "") {
          delete ov[field];
        } else {
          ov[field] = num(value);
        }
        return { ...sc, overrides: ov };
      }),
    );
  };
  const removeScenario = (id: number) => setScenarios((l) => l.filter((s) => s.id !== id));
  const addScenario = () => {
    setScenarios((l) => [...l, { id: seq, name: "시나리오 " + seq, overrides: {} }]);
    setSeq((n) => n + 1);
  };
  const ov = (sc: Scenario, key: keyof BepState) => (sc.overrides[key] !== undefined ? String(sc.overrides[key]) : "");

  const PROMO_OPTS: [PromotionType, string][] = [
    ["single", "단품"], ["two", "2개 구매"], ["2+1", "2+1"], ["3+1", "3+1"], ["freeship", "N개 이상 무료배송"], ["custom", "직접 수량 입력"],
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="BEP ROAS 계산기"
    >
      <div className="my-4 w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-pop" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-800">BEP ROAS 계산기</h2>
            <p className="mt-0.5 text-[11px] text-slate-400">판매가·원가·수수료·부가세까지 반영해 손익분기 광고비와 BEP ROAS를 계산합니다.</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="닫기">✕</button>
        </div>

        <div className="grid gap-5 px-5 py-4 lg:grid-cols-[1fr_1fr]">
          {/* ===== 입력 ===== */}
          <div className="space-y-4">
            {/* 제품 정보 */}
            <section>
              <h3 className="mb-2 text-xs font-bold text-slate-500">제품 정보</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="제품명"><input className={cn(inputCls, "text-left")} value={f.productName} onChange={(e) => setVal("productName", e.target.value)} /></Field>
                <Field label="프로모션 유형">
                  <select className={selectCls} value={f.promotionType} onChange={(e) => onPromotion(e.target.value as PromotionType)}>
                    {PROMO_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </Field>
                <Field label="개당 판매가 (원)"><input className={inputCls} inputMode="numeric" value={f.unitPrice} onChange={(e) => setNum("unitPrice", e.target.value)} /></Field>
                <Field label="개당 매입원가 (원)"><input className={inputCls} inputMode="numeric" value={f.unitCost} onChange={(e) => setNum("unitCost", e.target.value)} /></Field>
                <Field label="매입원가 부가세">
                  <select className={selectCls} value={String(f.costVatIncluded)} onChange={(e) => setVal("costVatIncluded", e.target.value === "true")}>
                    <option value="false">별도 (원가 = 공급가액)</option>
                    <option value="true">포함 (원가에 VAT 포함)</option>
                  </select>
                </Field>
                <Field label="평균 구매수량 (유료)"><input className={inputCls} inputMode="decimal" value={f.avgQty} onChange={(e) => setNum("avgQty", e.target.value)} /></Field>
                <Field label="무료 증정 수량"><input className={inputCls} inputMode="decimal" value={f.freeQty} onChange={(e) => setNum("freeQty", e.target.value)} /></Field>
              </div>
            </section>

            {/* 주문 비용 */}
            <section>
              <h3 className="mb-2 text-xs font-bold text-slate-500">주문 비용</h3>
              <div className="grid grid-cols-2 gap-3">
                <Field label="주문당 배송비 (원)"><input className={inputCls} inputMode="numeric" value={f.shippingPerOrder} onChange={(e) => setNum("shippingPerOrder", e.target.value)} /></Field>
                <Field label="고객 부담 배송비 (원)"><input className={inputCls} inputMode="numeric" value={f.customerShipping} onChange={(e) => setNum("customerShipping", e.target.value)} /></Field>
                <Field label="고객 부담 배송비 처리">
                  <select className={selectCls} value={f.customerShippingMode} onChange={(e) => setVal("customerShippingMode", e.target.value as CustomerShippingMode)}>
                    <option value="addRevenue">매출로 인식 (실결제금액 가산)</option>
                    <option value="offsetCost">배송비 상계 (실배송비 차감)</option>
                  </select>
                </Field>
                <Field label="결제 수수료 기준">
                  <select className={selectCls} value={f.paymentFeeBase} onChange={(e) => setVal("paymentFeeBase", e.target.value as FeeBase)}>
                    <option value="after">할인 후 실결제금액 기준</option>
                    <option value="before">할인 전 주문금액 기준</option>
                  </select>
                </Field>
                <Field label="결제 수수료율 (%)"><input className={inputCls} inputMode="decimal" value={f.paymentFeeRate} onChange={(e) => setNum("paymentFeeRate", e.target.value)} /></Field>
                <Field label="플랫폼 수수료율 (%)"><input className={inputCls} inputMode="decimal" value={f.platformFeeRate} onChange={(e) => setNum("platformFeeRate", e.target.value)} /></Field>
                <Field label="광고 대행 수수료율 (%)"><input className={inputCls} inputMode="decimal" value={f.adAgencyFeeRate} onChange={(e) => setNum("adAgencyFeeRate", e.target.value)} /></Field>
                <Field label="대행 수수료 기준">
                  <select className={selectCls} value={f.adAgencyFeeBase} onChange={(e) => setVal("adAgencyFeeBase", e.target.value as AgencyBase)}>
                    <option value="none">없음</option>
                    <option value="ad">광고비 기준</option>
                    <option value="revenue">매출 기준</option>
                  </select>
                </Field>
              </div>
            </section>

            {/* 할인 및 혜택 */}
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-xs font-bold text-slate-500">할인 및 혜택</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="즉시 할인금액 (원)"><input className={inputCls} inputMode="numeric" value={f.instantDiscount} onChange={(e) => setNum("instantDiscount", e.target.value)} /></Field>
                <Field label="쿠폰 할인금액 (원)"><input className={inputCls} inputMode="numeric" value={f.couponDiscount} onChange={(e) => setNum("couponDiscount", e.target.value)} /></Field>
                <Field label="적립금 사용금액 (원)"><input className={inputCls} inputMode="numeric" value={f.pointsUsed} onChange={(e) => setNum("pointsUsed", e.target.value)} /></Field>
                <Field label="할인·적립 관련 추가 비용 (원)"><input className={inputCls} inputMode="numeric" value={f.extraDiscountCost} onChange={(e) => setNum("extraDiscountCost", e.target.value)} /></Field>
              </div>
            </details>

            {/* 부가세 · 기타비용 */}
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-xs font-bold text-slate-500">부가세 · 기타비용</summary>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="부가세 계산 방식">
                  <select className={selectCls} value={f.vatMethod} onChange={(e) => setVal("vatMethod", e.target.value as VatMethod)}>
                    <option value="netOfInput">매출세액 − 매입세액 (일반과세)</option>
                    <option value="simple">단순 매출세액 (실결제 ÷ 11)</option>
                  </select>
                </Field>
                <Field label="배송비·기타비용 매입세액 공제">
                  <select className={selectCls} value={String(f.shippingVatDeductible)} onChange={(e) => setVal("shippingVatDeductible", e.target.value === "true")}>
                    <option value="true">공제 가능</option>
                    <option value="false">공제 불가</option>
                  </select>
                </Field>
                <Field label="기타 변동비 (원, 주문당)"><input className={inputCls} inputMode="numeric" value={f.otherVariableCost} onChange={(e) => setNum("otherVariableCost", e.target.value)} /></Field>
              </div>
            </details>

            {/* ROAS · 목표 설정 */}
            <details className="rounded-lg border border-slate-200 p-3">
              <summary className="cursor-pointer text-xs font-bold text-slate-500">ROAS · 목표 설정</summary>
              <div className="mt-3 grid grid-cols-1 gap-3">
                <Field label="BEP ROAS 산정 매출 기준">
                  <select className={selectCls} value={f.roasRevenueBasis} onChange={(e) => setVal("roasRevenueBasis", e.target.value as RoasBasis)}>
                    <option value="after">할인 후 실결제금액 (기본)</option>
                    <option value="before">할인 전 주문 매출</option>
                    <option value="withShipping">고객 부담 배송비 포함 결제금액</option>
                  </select>
                </Field>
                <Field label="목표 ROAS 목록 (%, 콤마로 구분)">
                  <input className={cn(inputCls, "text-left")} value={f.targetRoasListRaw} onChange={(e) => setVal("targetRoasListRaw", e.target.value)} />
                </Field>
              </div>
            </details>
          </div>

          {/* ===== 결과 ===== */}
          <div className="space-y-3">
            <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
              <p className="text-[11px] font-medium text-slate-500">BEP ROAS</p>
              <p className={cn("mt-0.5 text-3xl font-bold tabular-nums", canApply ? "text-brand" : "text-slate-300")}>
                {canApply ? pct(r.bepRoas) : "–"}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">기준 매출: {ROAS_BASIS_LABELS[f.roasRevenueBasis]} · 낮을수록 광고 여력이 큽니다</p>
              <div className="mt-3 border-t border-brand/20 pt-2">
                <Row label="광고비 차감 전 공헌이익" value={won(r.contributionMarginPreAd)} strong tone={toneClass(r.contributionMarginPreAd)} />
                <Row label="손익분기 광고비" value={r.bepValid ? won(r.bepAdCost) : "계산 불가"} tone={r.bepValid ? undefined : "text-rose-600"} />
                <Row label="제품 1개당 이익" value={won(r.perUnitProfit)} tone={toneClass(r.perUnitProfit)} />
                <Row label="주문 1건당 이익률" value={pct(r.orderProfitRate)} tone={toneClass(r.orderProfitRate)} />
              </div>
            </div>

            {!r.bepValid && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-600">
                손익분기 광고비가 0원 이하입니다. 현재 조건으로는 광고 집행 시 항상 적자이며 BEP ROAS를 계산할 수 없습니다.
              </div>
            )}

            {/* 상세 결과 */}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-bold text-slate-500">상세 결과</p>
              <div className="mt-2 border-t border-slate-100 pt-2">
                <Row label="주문 매출" value={won(r.orderRevenue)} />
                <Row label="고객 실결제금액" value={won(r.actualPayment)} />
                <Row label="유료 구매수량" value={qtyText(r.avgQty)} />
                <Row label="무료 증정수량" value={qtyText(r.freeQty)} />
                <Row label="총 출고수량" value={qtyText(r.totalQty)} />
                <Row label="총 제품원가" value={won(r.totalProductCost)} />
                <Row label="실배송비" value={won(r.realShipping)} />
                <Row label="결제 수수료" value={won(r.paymentFee)} />
                <Row label="플랫폼 수수료" value={won(r.platformFee)} />
                <Row label="부가세(납부)" value={won(r.netVat)} />
              </div>
            </div>

            {/* 목표 ROAS별 예상이익 */}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-bold text-slate-500">목표 ROAS별 예상이익</p>
              {r.targets.length === 0 ? (
                <p className="mt-2 text-[11px] text-slate-400">목표 ROAS 목록을 입력하세요 (예: 200,250,300)</p>
              ) : (
                <table className="mt-2 w-full border-t border-slate-100 pt-2 text-[11px]">
                  <thead>
                    <tr className="text-left text-slate-400">
                      <th className="py-1 font-medium">목표 ROAS</th>
                      <th className="py-1 text-right font-medium">예상 광고비</th>
                      <th className="py-1 text-right font-medium">예상 순이익</th>
                      <th className="py-1 text-right font-medium">이익률</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.targets.map((t) => (
                      <tr key={t.target} className="border-t border-slate-50">
                        <td className="py-1 text-slate-600">{t.target.toFixed(0)}%</td>
                        <td className="py-1 text-right tabular-nums text-slate-600">{won(t.adCost)}</td>
                        <td className={cn("py-1 text-right tabular-nums", toneClass(t.profit))}>{won(t.profit)}</td>
                        <td className={cn("py-1 text-right tabular-nums", toneClass(t.profitRate))}>{pct(t.profitRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>

        {/* 시나리오 비교 */}
        <div className="border-t border-slate-100 px-5 py-3">
          <button onClick={() => setShowScenarios((v) => !v)} className="text-xs font-bold text-slate-500 hover:text-slate-700">
            {showScenarios ? "▾" : "▸"} 시나리오 비교 (판매가·프로모션별 BEP 비교)
          </button>
          {showScenarios && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[820px] text-[11px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-400">
                    <th className="py-1 pr-2 font-medium">시나리오</th>
                    <th className="py-1 pr-2 font-medium">판매가</th>
                    <th className="py-1 pr-2 font-medium">프로모션</th>
                    <th className="py-1 pr-2 font-medium">적립금</th>
                    <th className="py-1 pr-2 font-medium">고객배송비</th>
                    <th className="py-1 pr-2 text-right font-medium">실결제</th>
                    <th className="py-1 pr-2 text-right font-medium">공헌이익</th>
                    <th className="py-1 pr-2 text-right font-medium">BEP 광고비</th>
                    <th className="py-1 pr-2 text-right font-medium">BEP ROAS</th>
                    <th className="py-1 pr-2 text-right font-medium">목표300% 이익</th>
                    <th className="py-1 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {scRows.rows.map(({ sc, res }) => {
                    const best = res.bepValid && scRows.minRoas !== null && res.bepRoas === scRows.minRoas;
                    return (
                      <tr key={sc.id} className={cn("border-b border-slate-100", !res.bepValid && "bg-rose-50/40", best && "bg-emerald-50/50")}>
                        <td className="py-1 pr-2">
                          <input className="w-28 rounded border border-slate-200 px-1 py-0.5 text-xs" value={sc.name} onChange={(e) => editScenario(sc.id, "name", e.target.value)} />
                          {!res.bepValid ? <span className="ml-1 rounded bg-rose-100 px-1 text-[9px] text-rose-600">계산불가</span> : best ? <span className="ml-1 rounded bg-emerald-100 px-1 text-[9px] text-emerald-700">최저 BEP</span> : null}
                        </td>
                        <td className="py-1 pr-2"><input type="number" step={100} className="w-20 rounded border border-slate-200 px-1 py-0.5 text-right text-xs" placeholder={String(num(f.unitPrice))} value={ov(sc, "unitPrice")} onChange={(e) => editScenario(sc.id, "unitPrice", e.target.value)} /></td>
                        <td className="py-1 pr-2">
                          <select className="rounded border border-slate-200 px-1 py-0.5 text-xs" value={(sc.overrides.promotionType as string) ?? ""} onChange={(e) => editScenario(sc.id, "promotionType", e.target.value)}>
                            <option value="">(기본)</option>
                            {PROMO_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                          </select>
                        </td>
                        <td className="py-1 pr-2"><input type="number" step={100} className="w-20 rounded border border-slate-200 px-1 py-0.5 text-right text-xs" placeholder={String(num(f.pointsUsed))} value={ov(sc, "pointsUsed")} onChange={(e) => editScenario(sc.id, "pointsUsed", e.target.value)} /></td>
                        <td className="py-1 pr-2"><input type="number" step={100} className="w-20 rounded border border-slate-200 px-1 py-0.5 text-right text-xs" placeholder={String(num(f.customerShipping))} value={ov(sc, "customerShipping")} onChange={(e) => editScenario(sc.id, "customerShipping", e.target.value)} /></td>
                        <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{won(res.actualPayment)}</td>
                        <td className={cn("py-1 pr-2 text-right tabular-nums", toneClass(res.contributionMarginPreAd))}>{won(res.contributionMarginPreAd)}</td>
                        <td className="py-1 pr-2 text-right tabular-nums text-slate-600">{res.bepValid ? won(res.bepAdCost) : "-"}</td>
                        <td className="py-1 pr-2 text-right tabular-nums font-semibold text-slate-700">{res.bepRoas !== null ? pct(res.bepRoas) : "-"}</td>
                        <td className={cn("py-1 pr-2 text-right tabular-nums", toneClass(res.target300Profit))}>{won(res.target300Profit)}</td>
                        <td className="py-1"><button onClick={() => removeScenario(sc.id)} className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-400 hover:bg-slate-50">삭제</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <button onClick={addScenario} className="mt-2 rounded-md border border-slate-300 px-2.5 py-1 text-[11px] text-slate-600 hover:bg-slate-50">+ 시나리오 추가</button>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <p className="text-[10px] text-slate-400">{canApply ? "계산된 BEP ROAS를 입력칸에 바로 적용합니다." : "판매가·비용을 입력하면 BEP ROAS가 계산됩니다."}</p>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={() => { setF(initForm()); setScenarios(defaultScenarios()); }} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50">초기화</button>
            <button onClick={onClose} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">닫기</button>
            <button
              disabled={!canApply}
              onClick={() => { if (r.bepRoas == null) return; onApply(Math.round(r.bepRoas * 10) / 10); onClose(); }}
              className={cn("rounded-md px-3 py-1.5 text-xs font-semibold text-white", canApply ? "bg-brand hover:bg-brand-dark" : "cursor-not-allowed bg-slate-300")}
            >
              이 값 적용
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
