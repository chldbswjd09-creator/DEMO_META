// 수익성 서술 문장 — 공유용 요약과 자동진단이 동일한 문구를 재사용한다.
// 추정 ROAS(=CSV) vs 직접 입력한 BEP ROAS 비교 기준.

import { formatPct } from "@/lib/metrics/format";
import type { ProfitVerdict } from "@/lib/materials/profit";

export function diffPpText(diffPp: number | null): string {
  if (diffPp == null) return "-";
  const sign = diffPp > 0 ? "+" : "";
  return `${sign}${diffPp.toFixed(1)}%p`;
}

// 추정 ROAS·입력 BEP ROAS로부터 수익성 판정 도출
export function profitVerdictOf(estimatedRoas: number | null, bepRoas: number | null): ProfitVerdict {
  if (estimatedRoas == null) return "추정 ROAS 계산 불가";
  if (bepRoas == null) return "BEP ROAS 입력 필요";
  if (estimatedRoas > bepRoas) return "BEP 초과";
  if (estimatedRoas < bepRoas) return "BEP 미달";
  return "손익분기";
}

export function isProfitDecided(v: ProfitVerdict): boolean {
  return v === "BEP 초과" || v === "BEP 미달" || v === "손익분기";
}

export interface ProfitCopyInput {
  name: string;
  estimatedRoas: number | null;
  bepRoas: number | null;
  diffPp: number | null;
  verdict: ProfitVerdict;
  dataInsufficient: boolean; // 성과 데이터 부족/추가 관찰 여부
}

// 수익성 핵심 문장 (BEP 초과/미달/손익분기 + 데이터 부족 보강)
export function profitSentence(i: ProfitCopyInput): string {
  const { estimatedRoas: e, bepRoas: b } = i;
  if (e == null && b == null)
    return "추정 ROAS를 계산할 수 없고 BEP ROAS도 입력되지 않아 수익성 비교가 불가합니다.";
  if (e == null)
    return "CSV에 구매 매출 데이터가 없어 추정 ROAS를 계산할 수 없습니다. 수익성 비교가 불가합니다.";
  if (b == null)
    return "BEP ROAS가 입력되지 않았습니다. 메인 화면에서 BEP ROAS를 입력하면 추정 ROAS와 비교합니다.";

  const eTxt = formatPct(e);
  const bTxt = formatPct(b);
  const d = diffPpText(i.diffPp);
  let core: string;
  if (i.verdict === "BEP 초과")
    core = `${i.name}은(는) 추정 ROAS ${eTxt}로 BEP ROAS ${bTxt}를 ${d} 상회해 현재 수익성 기준 BEP 초과 상태입니다.`;
  else if (i.verdict === "BEP 미달")
    core = `${i.name}은(는) 추정 ROAS ${eTxt}로 BEP ROAS ${bTxt} 대비 ${d} 미달해 현재 손익분기점에 도달하지 못했습니다.`;
  else core = `${i.name}은(는) 추정 ROAS와 BEP ROAS가 ${bTxt}로 동일해 현재 손익분기 수준입니다.`;

  if (i.dataInsufficient && i.verdict === "BEP 초과")
    return `${core} 다만 집행 데이터가 아직 부족해 성과를 확정하기 어렵습니다.`;
  return core;
}

// 자동진단 '주요 이슈' 보강 문장 (BEP + CPA/데이터 상태 조합). 해당 없으면 null.
export function profitIssueSentence(
  verdict: ProfitVerdict,
  cpaOverTarget: boolean | null,
  dataInsufficient: boolean,
): string | null {
  if (verdict === "BEP 미달" && cpaOverTarget)
    return "현재 추정 ROAS가 BEP ROAS를 하회하고 있으며 CPA도 높은 상태입니다. 구매 전환 효율 개선 또는 소재 교체 검토가 필요합니다.";
  if (verdict === "BEP 초과" && dataInsufficient)
    return "현재 수익성은 BEP를 상회하지만 집행 데이터가 아직 부족해 추가 관찰이 필요합니다.";
  if (verdict === "BEP 초과" && !dataInsufficient)
    return "현재 추정 ROAS가 BEP ROAS를 상회하고 있으며 데이터도 충분한 편입니다. 추가 집행을 유지하면서 성과 추이를 확인할 수 있습니다.";
  return null;
}
