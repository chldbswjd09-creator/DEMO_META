// 공유용 요약 '운영 판단' — ROAS만이 아니라 집행기간→노출→CTR→구매데이터→ROAS 순 퍼널로 해석한다.
// 지표 계산식은 바꾸지 않는다. 여기서는 이미 계산된 값을 받아 '해석/판단 문구'만 생성한다.
// 임계값은 Meta 공식 기준이 아니라 현재 운영을 위한 내부 판단 기준이다.

import type { VerdictCode } from "@/lib/types";
import { formatNumber, formatPct } from "@/lib/metrics/format";

// 내부 판단 기준
const IMPR_1ST = 1500; // 1차 판단 가능
const IMPR_ENOUGH = 3000; // 비교적 충분
const CTR_BASE = 2; // %
const CVR_MIN_CLICKS = 30; // 본격 CVR 판단 최소 링크 클릭
const CVR_MIN_PURCH = 3; // 본격 CVR 판단 최소 구매

export interface OpInput {
  name: string;
  elapsedDays: number | null; // 집행 경과일 (실제 데이터 포함 기간 기준)
  impressions: number | null; // null = 원본 열 없음
  ctr: number | null; // % (null = 계산 불가)
  linkClicks: number | null; // null = 원본 열 없음
  purchases: number | null; // null = 원본 열 없음
  cvr: number | null; // %
  roas: number | null;
  bepRoas: number | null;
}

export type ImprLevel = "부족" | "1차 판단 가능" | "충분" | "확인 불가";

export interface OpResult {
  verdict: VerdictCode; // keep | monitor | pause_candidate
  imprLevel: ImprLevel;
  imprNote: string;
  cvrReference: boolean; // CVR 참고용?
  cvrNote: string;
  purchaseText: string; // '구매 N건' | '구매 데이터 확인 불가'
  summaryLine: string; // "10일 집행 / 노출 6,948회 / CTR 0.8% (57건) / 구매 0건"
  sentence: string; // 핵심 판단 문장(앞단부터)
  roasSentence: string | null; // 수익성 한 줄(가능할 때)
}

function imprLevelOf(impr: number | null): ImprLevel {
  if (impr == null) return "확인 불가";
  if (impr < IMPR_1ST) return "부족";
  if (impr < IMPR_ENOUGH) return "1차 판단 가능";
  return "충분";
}
function imprNoteOf(level: ImprLevel): string {
  if (level === "확인 불가") return "노출 데이터를 확인할 수 없습니다.";
  if (level === "부족") return "아직 노출 데이터가 부족해 성과 판단이 어렵습니다.";
  if (level === "1차 판단 가능") return "1차 성과 판단이 가능한 수준의 노출이 확보되었습니다.";
  return "충분한 노출 데이터가 확보되었습니다.";
}

export function judgeOperation(i: OpInput): OpResult {
  const level = imprLevelOf(i.impressions);
  const impr1st = i.impressions != null && i.impressions >= IMPR_1ST;
  const imprEnough = i.impressions != null && i.impressions >= IMPR_ENOUGH;

  // CVR 데이터 충분도
  const clicksLow = i.linkClicks == null || i.linkClicks < CVR_MIN_CLICKS;
  const purchLow = i.purchases == null || i.purchases <= 2;
  const cvrJudgeable = i.linkClicks != null && i.linkClicks >= CVR_MIN_CLICKS && i.purchases != null && i.purchases >= CVR_MIN_PURCH;
  const cvrReference = i.cvr != null && !cvrJudgeable && (clicksLow || purchLow);
  const cvrNote = i.cvr == null
    ? "구매전환율을 계산할 수 없습니다."
    : cvrJudgeable
      ? "구매·클릭 데이터가 충분해 구매전환율을 판단할 수 있습니다."
      : "구매·클릭 데이터가 적어 구매전환율은 참고용입니다.";

  // 주요 지표 (계산 가능한 것만 판단)
  const roasBelow = i.roas != null && i.bepRoas != null ? i.roas < i.bepRoas : null;
  const roasAbove = i.roas != null && i.bepRoas != null ? i.roas >= i.bepRoas : null;
  const ctrLow = i.ctr != null ? i.ctr < CTR_BASE : null;
  const noPurchase = i.purchases != null ? i.purchases === 0 : null; // 실제 0 (열 없음 아님)
  const poor = ctrLow === true || noPurchase === true || roasBelow === true;

  // ── 운영 판단 (우선순위) ──
  let verdict: VerdictCode;
  if (i.elapsedDays == null || i.elapsedDays < 3) {
    verdict = "monitor"; // ① 집행 3일 미만
  } else if (!impr1st) {
    verdict = "monitor"; // ② 노출 1,500 미만(또는 열 없음)
  } else if (i.elapsedDays <= 4) {
    // ③ 3~4일: 미달이면 추가 관찰(2일 추가 확인), 수익성 확보+반응 양호면 유지
    verdict = roasAbove === true && ctrLow !== true && noPurchase !== true ? "keep" : "monitor";
  } else if (roasAbove === true) {
    verdict = "keep"; // ⑤ 수익성 확보
  } else if (imprEnough && poor) {
    verdict = "pause_candidate"; // ④ 5일+ 충분 데이터 + 지속 부진
  } else {
    verdict = "monitor";
  }

  // ── 성과 요약 한 줄 ──
  const execText = i.elapsedDays != null ? `${i.elapsedDays}일 집행` : "집행 기간 정보 없음";
  const imprText = i.impressions != null ? `노출 ${formatNumber(i.impressions)}회` : "노출 데이터 없음";
  const ctrText = i.ctr != null ? `CTR ${formatPct(i.ctr)}${i.linkClicks != null ? ` (${formatNumber(i.linkClicks)}건)` : ""}` : "CTR 계산 불가";
  const purchaseText = i.purchases != null ? `구매 ${formatNumber(i.purchases)}건` : "구매 데이터 확인 불가";
  const summaryLine = `${execText} / ${imprText} / ${ctrText} / ${purchaseText}`;

  // ── 핵심 판단 문장 (앞단부터: 데이터부족 → 소재반응 → 구매전환 → 수익성) ──
  let sentence: string;
  if (i.elapsedDays == null || i.elapsedDays < 3 || !impr1st) {
    sentence = "집행 기간·노출 데이터가 부족해 현재 성과를 확정하기 어려우며 추가 관찰이 필요합니다.";
  } else if (ctrLow === true && noPurchase === true) {
    sentence = "충분히 노출됐으나 CTR이 낮고 구매전환도 발생하지 않았습니다.";
  } else if (ctrLow === true) {
    sentence = "충분히 노출됐으나 CTR이 2% 기준에 미달해 소재 반응이 낮습니다.";
  } else if (noPurchase === true) {
    sentence = "소재 클릭 반응은 양호하지만 구매전환이 발생하지 않아 랜딩·상품·오퍼 단계 확인이 필요합니다.";
  } else if (cvrReference) {
    sentence = "소재 클릭 반응은 양호하나 구매 데이터가 아직 적어 구매전환율은 참고용으로 확인이 필요합니다.";
  } else if (roasBelow === true) {
    sentence = "구매전환은 발생하지만 ROAS가 BEP ROAS에 미달해 수익성이 부족합니다.";
  } else if (roasAbove === true) {
    sentence = "충분한 데이터가 확보됐으며 소재 반응·구매전환이 발생하고 ROAS가 BEP ROAS를 상회해 수익성이 확보됐습니다.";
  } else {
    sentence = "충분한 데이터가 확보됐으며 소재 반응·구매전환이 발생하고 있습니다.";
  }

  // ── 수익성 한 줄(보고 추가용) ──
  let roasSentence: string | null = null;
  if (i.roas != null && i.bepRoas != null) {
    roasSentence = roasBelow
      ? `ROAS ${formatPct(i.roas)}로 BEP ROAS ${formatPct(i.bepRoas)}에 미달`
      : `ROAS ${formatPct(i.roas)}로 BEP ROAS ${formatPct(i.bepRoas)}를 상회해 수익성 확보`;
  }

  return { verdict, imprLevel: level, imprNote: imprNoteOf(level), cvrReference, cvrNote, purchaseText, summaryLine, sentence, roasSentence };
}
