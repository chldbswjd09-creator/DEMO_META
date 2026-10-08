// 규칙 기반 성과 판정 엔진 (PLAN.md §14).
// 동일 입력 → 동일 판정(결정론적). 원인은 확정하지 않고 "가능성/의심/확인 필요"로 표현.

import type {
  AggregatedInsight,
  AnalysisSettings,
  CreativeType,
  MetricGroup,
  Verdict,
  VerdictCode,
} from "@/lib/types";
import { findMetric } from "@/lib/metrics/calc";
import { formatKRW, formatPct } from "@/lib/metrics/format";

export const VERDICT_META: Record<
  VerdictCode,
  { label: string; tone: "good" | "warn" | "bad" | "neutral"; icon: string }
> = {
  scale_candidate: { label: "확장 후보", tone: "good", icon: "▲" },
  keep: { label: "유지", tone: "good", icon: "◆" },
  monitor: { label: "추가 관찰", tone: "neutral", icon: "⟳" },
  pause_candidate: { label: "중단 검토", tone: "bad", icon: "■" },
  data_insufficient: { label: "데이터 부족", tone: "neutral", icon: "…" },
  creative_fatigue: { label: "소재 피로도 의심", tone: "warn", icon: "◷" },
  creative_issue: { label: "소재 문제 의심", tone: "warn", icon: "✎" },
  landing_issue: { label: "랜딩 문제 의심", tone: "warn", icon: "⚑" },
  tracking_issue: { label: "전환 측정 문제 의심", tone: "warn", icon: "◎" },
};

interface EngineInput {
  cur: AggregatedInsight;
  prev: AggregatedInsight | null;
  hasPrevData: boolean;
  creativeType: CreativeType;
  daysRunning: number;
  groups: MetricGroup[];
  contributionSpendShare: number | null;
  contributionRevenue: number | null;
  settings: AnalysisSettings;
}

export function evaluate(input: EngineInput): Verdict {
  const { cur, prev, hasPrevData, creativeType, daysRunning, groups, settings } = input;
  const isVideo = creativeType === "video";

  const m = (k: string) => findMetric(groups, k);
  const val = (k: string) => m(k)?.current ?? null;
  const chg = (k: string) => m(k)?.changePct ?? null;

  const ctr = val("ctr");
  const cpc = val("cpc");
  const cpa = val("cpa");
  const roas = val("roas");
  const landingRate = val("landingRate");
  const landingCost = val("landingCost");
  const purchaseRate = val("purchaseRate");
  const hookRate = val("hookRate");
  const frequency = val("frequency");

  // ── 1. 데이터 충분도 우선 판단 ──────────────────────────────
  const sufficiencyFail =
    cur.spend < settings.minSpend ||
    cur.impressions < settings.minImpressions ||
    cur.linkClicks < settings.minLinkClicks ||
    daysRunning < settings.baseObservationDays;

  if (sufficiencyFail) {
    const reasons: string[] = [];
    if (cur.spend < settings.minSpend)
      reasons.push(
        `광고비 ${formatKRW(cur.spend)}로 최소 판단 기준(${formatKRW(settings.minSpend)}) 미달`,
      );
    if (cur.impressions < settings.minImpressions)
      reasons.push(`노출이 최소 기준(${settings.minImpressions.toLocaleString()})보다 적음`);
    if (daysRunning < settings.baseObservationDays)
      reasons.push(`집행 기간이 기본 관찰 기간(${settings.baseObservationDays}일)보다 짧음`);
    return {
      code: "data_insufficient",
      confidence: "낮음",
      dataSufficiency: "부족",
      reasons: reasons.slice(0, 3),
      action: `${settings.baseObservationDays}일 이상 관찰 후 재평가를 권장합니다. 현재 데이터만으로 성과를 단정하기 어렵습니다.`,
      caution: "예산이 충분히 소진되지 않아 저성과로 단정하지 않습니다.",
    };
  }

  const sufficiency: Verdict["dataSufficiency"] =
    cur.landingPageViews >= settings.minLandingViews && cur.purchases >= settings.minPurchases
      ? "충분"
      : "제한적";

  // 파생 플래그
  const ctrLow = ctr !== null && ctr < settings.baseCtr;
  const cpcHigh = cpc !== null && cpc > settings.baseCpc;
  const landingLow = landingRate !== null && landingRate < settings.baseLandingRate;
  const landingCostHigh = landingCost !== null && landingCost > settings.baseLandingCost;
  const purchaseRateLow = purchaseRate !== null && purchaseRate < settings.basePurchaseRate;
  const hookLow = isVideo && hookRate !== null && hookRate < settings.baseHookRate;
  const freqHigh = frequency !== null && frequency >= settings.fatigueFrequency;
  const roasOk = roas !== null && roas >= settings.targetRoas;
  const cpaOk = cpa !== null && cpa <= settings.targetCpa;
  const roasVeryLow = roas !== null && roas < settings.targetRoas * settings.pauseRoasRatio;

  const sc = settings.significantChangePct;
  const ctrDown = hasPrevData && (chg("ctr") ?? 0) < -sc;
  const cpcUp = hasPrevData && (chg("cpc") ?? 0) > sc;
  const cpaUp = hasPrevData && (chg("cpa") ?? 0) > sc;
  const roasDown = hasPrevData && (chg("roas") ?? 0) < -sc;
  const purchaseRateDown = hasPrevData && (chg("purchaseRate") ?? 0) < -sc;

  const prevHadPurchases = prev !== null && prev.purchases > 0;

  // ── 2. 전환 측정 문제 의심 ──────────────────────────────────
  if (
    cur.landingPageViews >= settings.minLandingViews &&
    cur.purchases === 0 &&
    (prevHadPurchases || !cur.conversionComplete)
  ) {
    const reasons = [
      `링크 클릭(${cur.linkClicks.toLocaleString()})·랜딩 조회(${cur.landingPageViews.toLocaleString()})는 발생했으나 구매만 0건`,
    ];
    if (prevHadPurchases) reasons.push("이전 기간에는 구매가 발생했음");
    if (!cur.conversionComplete) reasons.push("일부 날짜의 전환 데이터가 누락됨");
    return {
      code: "tracking_issue",
      confidence: "보통",
      dataSufficiency: sufficiency,
      reasons: reasons.slice(0, 3),
      action: "성과 저하로 단정하기 전에 전환 측정(픽셀/이벤트/Attribution) 상태 확인을 먼저 권장합니다.",
      caution: "측정 문제 가능성이 있어 데이터만으로 소재/랜딩 문제로 단정하기 어렵습니다.",
    };
  }

  // ── 3. 소재 피로도 의심 (복합 조건) ─────────────────────────
  const fatigueSignals = [freqHigh, ctrDown, cpcUp || cpaUp, roasDown, purchaseRateDown].filter(
    Boolean,
  ).length;
  if (freqHigh && ctrDown && (cpcUp || cpaUp) && (roasDown || purchaseRateDown)) {
    const reasons = [
      `빈도 ${frequency?.toFixed(2)}로 상승`,
      "CTR 하락·CPC 또는 CPA 상승 동반",
      "최근 기간 성과가 이전 기간보다 하락",
    ];
    return {
      code: "creative_fatigue",
      confidence: fatigueSignals >= 4 ? "높음" : "보통",
      dataSufficiency: sufficiency,
      reasons: reasons.slice(0, 3),
      action: "즉시 중단보다는 유지하면서 동일 후킹 구조의 디벨롭 소재를 병행하는 방향을 검토합니다.",
      caution: "소재 피로도 여부는 추가 데이터로 확인이 필요합니다.",
    };
  }

  // ── 4. 랜딩 문제 의심 ───────────────────────────────────────
  if (!ctrLow && cur.linkClicks >= settings.minLinkClicks && landingLow && landingCostHigh) {
    return {
      code: "landing_issue",
      confidence: "보통",
      dataSufficiency: sufficiency,
      reasons: [
        `CTR ${ctr !== null ? formatPct(ctr) : "-"}로 클릭은 양호`,
        `랜딩 도달률 ${landingRate !== null ? formatPct(landingRate) : "-"}로 낮음`,
        "랜딩 조회당 비용이 기준보다 높음",
      ],
      action: "페이지 로딩 속도·링크 오류·리디렉션·랜딩 연결 확인 가능성을 점검합니다.",
      caution: "사이트에서 직접 확인하지 못한 원인은 확정하지 않습니다.",
    };
  }

  // ── 5. 소재 문제 의심 ───────────────────────────────────────
  if (ctrLow && cpcHigh && (!isVideo || hookLow)) {
    const reasons = [
      `CTR ${ctr !== null ? formatPct(ctr) : "-"}로 기준(${formatPct(settings.baseCtr)}) 미달`,
      `CPC ${cpc !== null ? formatKRW(cpc) : "-"}로 기준보다 높음`,
    ];
    if (hookLow) reasons.push(`후킹률 ${hookRate !== null ? formatPct(hookRate) : "-"}로 낮음`);
    return {
      code: "creative_issue",
      confidence: "보통",
      dataSufficiency: sufficiency,
      reasons: reasons.slice(0, 3),
      action: "첫 장면·첫 자막·썸네일 등 초기 후킹 요소 개선 가능성을 검토합니다.",
      caution: "데이터만으로 소재 내용의 원인을 확정하지 않습니다.",
    };
  }

  // ── 6. 성과 우수 / 유지 ─────────────────────────────────────
  if (roasOk && cpaOk) {
    const strongContribution =
      input.contributionRevenue !== null &&
      input.contributionSpendShare !== null &&
      input.contributionRevenue - input.contributionSpendShare > settings.strongContributionGapPct;
    const code: VerdictCode = strongContribution ? "scale_candidate" : "keep";
    const reasons = [
      `ROAS ${roas !== null ? formatPct(roas) : "-"} (기준 ${formatPct(settings.targetRoas)} 이상)`,
      `CPA ${cpa !== null ? formatKRW(cpa) : "-"} (목표 ${formatKRW(settings.targetCpa)} 이하)`,
    ];
    if (strongContribution) reasons.push("광고비 비중 대비 매출 기여도가 높음");
    return {
      code,
      confidence: "높음",
      dataSufficiency: sufficiency,
      reasons: reasons.slice(0, 3),
      action: strongContribution
        ? "유지하면서 예산 확대 및 동일 구조 디벨롭 소재 확장을 검토합니다."
        : "현재 성과를 유지하며 소폭 디벨롭 소재를 병행하는 방향을 검토합니다.",
      caution: freqHigh ? "빈도가 높은 편이라 소재 피로도 추이를 함께 관찰합니다." : undefined,
    };
  }

  // ── 7. 구매 전환 문제 / 중단 검토 ───────────────────────────
  if (!landingLow && cur.landingPageViews >= settings.minLandingViews && (purchaseRateLow || roasVeryLow)) {
    if (roasVeryLow) {
      return {
        code: "pause_candidate",
        confidence: "보통",
        dataSufficiency: sufficiency,
        reasons: [
          `ROAS ${roas !== null ? formatPct(roas) : "계산 불가"}로 기준을 크게 밑돔`,
          `구매 전환율 ${purchaseRate !== null ? formatPct(purchaseRate) : "-"}`,
          "랜딩 도달은 정상이나 구매 효율이 낮음",
        ],
        action: "중단을 검토하되, 상품 설득력·가격·결제 과정·전환 측정을 함께 점검한 뒤 결정합니다.",
        caution: "데이터만으로 원인을 단정하지 않습니다.",
      };
    }
    return {
      code: "monitor",
      confidence: "보통",
      dataSufficiency: sufficiency,
      reasons: [
        "랜딩 도달은 정상이나 구매 전환율이 기준보다 낮음",
        `CPA ${cpa !== null ? formatKRW(cpa) : "구매 없음"}`,
      ],
      action: "랜딩 이후 전환 효율(상품/가격/결제/측정) 점검과 함께 추가 관찰을 권장합니다.",
    };
  }

  // ── 8. 애매 → 추가 관찰 ─────────────────────────────────────
  return {
    code: "monitor",
    confidence: "보통",
    dataSufficiency: sufficiency,
    reasons: [
      "일부 지표는 양호하나 목표 대비 판단이 애매함",
      `ROAS ${roas !== null ? formatPct(roas) : "계산 불가"}, CPA ${cpa !== null ? formatKRW(cpa) : "구매 없음"}`,
    ],
    action: `${settings.extraObservationDays}일 추가 관찰 후 재평가를 권장합니다.`,
  };
}
