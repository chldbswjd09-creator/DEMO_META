// 공유용 요약 / 보고 문구 생성 (규칙 기반).
// 실제 연동 단계에서 Claude API 결과로 대체하되, Claude 실패 시 이 함수가 폴백으로 사용된다.
// 원칙: 숫자를 새로 만들지 않고, 판정 엔진/지표 계산 결과만 문장으로 정리한다.

import type { AdAnalysis } from "@/lib/analysis/analyze";
import { findMetric } from "@/lib/metrics/calc";
import { formatMetricValue } from "@/lib/metrics/format";
import { VERDICT_META } from "@/lib/verdict/engine";

export interface ShareSummary {
  conclusion: string;
  performance: string;
  issue: string;
  basis: string;
  action: string;
  lines: string[]; // 복사용 (전체)
}

export function buildShareSummary(a: AdAnalysis): ShareSummary {
  const vm = VERDICT_META[a.verdict.code];
  const roas = findMetric(a.groups, "roas");
  const cpa = findMetric(a.groups, "cpa");
  const ctr = findMetric(a.groups, "ctr");
  const landing = findMetric(a.groups, "landingRate");

  const conclusion = `${a.ad.name}은(는) 현재 데이터상 '${vm.label}'로 판단됩니다.`;

  const perfParts: string[] = [];
  if (roas && roas.state === "ok") perfParts.push(`ROAS ${formatMetricValue(roas)}`);
  if (cpa && cpa.state === "ok") perfParts.push(`CPA ${formatMetricValue(cpa)}`);
  if (ctr && ctr.state === "ok") perfParts.push(`CTR ${formatMetricValue(ctr)}`);
  const performance = perfParts.length
    ? `핵심 성과: ${perfParts.join(", ")}.`
    : "핵심 성과: 아직 판단에 필요한 성과 데이터가 충분하지 않습니다.";

  const issue = a.verdict.caution
    ? `주요 이슈: ${a.verdict.caution}`
    : landing && landing.state === "ok"
      ? `주요 이슈: 클릭 이후 랜딩 유입까지는 ${formatMetricValue(landing)} 수준으로 확인됩니다.`
      : "주요 이슈: 특이 이슈는 확인되지 않았습니다.";

  const basis = `판단 근거: ${a.verdict.reasons.slice(0, 3).join(" · ")}.`;
  const action = `추천 액션: ${a.verdict.action}`;

  const lines = [conclusion, performance, issue, basis, action];
  return { conclusion, performance, issue, basis, action, lines };
}

export function summaryToText(s: ShareSummary): string {
  return s.lines.join("\n\n");
}
