"use client";

// 공유용 요약 — 운영 판단(집행기간→노출→CTR→구매데이터→ROAS 퍼널)을 최상단에 노출.
// 지표 값은 기존 계산 엔진(perf.groups / perf.cur / profit)을 그대로 재사용한다(재계산 없음).

import { useState } from "react";
import type { CsvAdAnalysis } from "@/lib/csv/analyze";
import type { PerfField } from "@/lib/csv/columnMap";
import type { AdProfitView } from "@/lib/materials/profitView";
import { judgeOperation } from "@/lib/materials/opJudgment";
import { effectivePresent } from "@/lib/csv/analyze";
import { findMetric } from "@/lib/metrics/calc";
import { formatMetricValue, formatPct, formatKRW, formatNumber } from "@/lib/metrics/format";
import { VERDICT_META } from "@/lib/verdict/engine";
import { diffPpText } from "@/lib/materials/profitCopy";
import { cn } from "@/lib/cn";

function metricVal(perf: CsvAdAnalysis, key: string): number | null {
  const m = findMetric(perf.groups, key);
  return m && m.state === "ok" && m.current != null ? m.current : null;
}
function metricText(perf: CsvAdAnalysis, key: string): string {
  const m = findMetric(perf.groups, key);
  return m ? formatMetricValue(m) : "-";
}
function fmtDot(iso: string | null | undefined): string {
  return iso ? iso.replace(/-/g, ".") : "-";
}

const VERDICT_TONE: Record<string, string> = {
  "BEP 초과": "text-emerald-700",
  "BEP 미달": "text-rose-700",
  손익분기: "text-slate-700",
};
const OP_TONE: Record<string, string> = {
  keep: "border-emerald-300 bg-emerald-50 text-emerald-700",
  monitor: "border-amber-300 bg-amber-50 text-amber-700",
  pause_candidate: "border-rose-300 bg-rose-50 text-rose-700",
};

export interface ShareSummaryProps {
  title: string;
  perf: CsvAdAnalysis;
  profit: AdProfitView;
  startDate?: string | null;
  elapsedDays?: number | null;
  perfVerdictOverride?: import("@/lib/types").VerdictCode; // (하위호환) 미사용 — 운영 판단은 퍼널 기준
  present?: PerfField[];
  nameStart?: string | null;
  dataStart?: string | null;
  dataEnd?: string | null;
  dataDays?: number | null;
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={cn("truncate text-sm font-bold", tone ?? "text-slate-800")} title={value}>{value}</p>
    </div>
  );
}

// 원본 열 없으면 '원본 열 없음' (0으로 만들지 않음)
function rawText(perf: CsvAdAnalysis, present: PerfField[] | undefined, field: PerfField, money: boolean): string {
  if (present && !present.includes(field)) return "원본 열 없음";
  const v = (perf.cur as unknown as Record<string, number>)[field] ?? 0;
  return money ? formatKRW(v) : formatNumber(v);
}
function rawNum(perf: CsvAdAnalysis, present: PerfField[] | undefined, field: PerfField): number | null {
  if (present && !present.includes(field)) return null;
  return (perf.cur as unknown as Record<string, number>)[field] ?? 0;
}

export function ShareSummary(props: ShareSummaryProps) {
  const { title, perf, profit } = props;
  const [copied, setCopied] = useState(false);
  // 혼합 CSV 안전: 이 집계에 구매 근거가 없으면 purchases 를 '원본 열 없음'으로 취급.
  const present = props.present ? effectivePresent(perf.cur, props.present) : props.present;

  const op = judgeOperation({
    name: title,
    elapsedDays: props.elapsedDays ?? null,
    impressions: rawNum(perf, present, "impressions"),
    ctr: metricVal(perf, "ctr"),
    linkClicks: rawNum(perf, present, "linkClicks"),
    purchases: rawNum(perf, present, "purchases"),
    cvr: metricVal(perf, "purchaseRate"),
    roas: profit.estimatedRoas,
    bepRoas: profit.bepRoas,
  });

  const isIntegratedDates = props.dataStart != null;
  const est = profit.estimatedRoas;
  const bep = profit.bepRoas;
  // Meta 원본 '구매 ROAS' 참고값 — 원본 열이 있을 때만 표시(없으면 '원본 열 없음', 0/역산 금지).
  const metaRoasText =
    present && !present.includes("purchaseRoas")
      ? "원본 열 없음"
      : profit.metaRoas == null
        ? "계산 불가"
        : formatPct(profit.metaRoas);

  const copy = async () => {
    const lines = [op.summaryLine, op.sentence];
    if (op.roasSentence) lines.push(op.roasSentence);
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("아래 내용을 복사하세요.", text);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      {/* 운영 판단 */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-slate-500">운영 판단</span>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-bold", OP_TONE[op.verdict] ?? "border-slate-300 bg-slate-100 text-slate-600")}>
          {VERDICT_META[op.verdict].label}
        </span>
      </div>

      {/* 성과 요약 (짧은 보고 형식) */}
      <div className="rounded-md border border-slate-200 bg-white p-3">
        <p className="mb-1 text-[11px] font-bold text-slate-600">성과 요약</p>
        <p className="text-xs font-semibold text-slate-800">{op.summaryLine}</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-600">{op.sentence}</p>
        {op.roasSentence && <p className="mt-0.5 text-[11px] text-slate-500">{op.roasSentence}</p>}
      </div>

      {/* 데이터 */}
      <div className="mt-2 rounded-md border border-slate-200 bg-white p-3">
        <p className="mb-2 text-[11px] font-bold text-slate-600">데이터</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
          <Cell label="집행 경과일" value={props.elapsedDays != null ? `${props.elapsedDays}일` : "-"} />
          <Cell label="노출" value={rawText(perf, present, "impressions", false)} />
          <Cell label="데이터 충분도" value={op.imprLevel} />
          {isIntegratedDates && <Cell label="소재명 기준 시작일" value={fmtDot(props.nameStart)} />}
          {isIntegratedDates && <Cell label="실제 데이터 포함 기간" value={`${fmtDot(props.dataStart)} ~ ${fmtDot(props.dataEnd)}`} />}
          {isIntegratedDates && <Cell label="데이터 포함일" value={props.dataDays != null ? `${props.dataDays}일` : "-"} />}
        </div>
        <p className="mt-2 text-[10px] text-slate-400">{op.imprNote}</p>
      </div>

      {/* 소재 반응 */}
      <div className="mt-2 rounded-md border border-slate-200 bg-white p-3">
        <p className="mb-2 text-[11px] font-bold text-slate-600">소재 반응</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <Cell label="CTR" value={metricText(perf, "ctr")} tone={metricVal(perf, "ctr") != null ? (metricVal(perf, "ctr")! >= 2 ? "text-emerald-600" : "text-rose-600") : "text-slate-400"} />
          <Cell label="링크 클릭" value={rawText(perf, present, "linkClicks", false)} />
          <Cell label="CPM" value={metricText(perf, "cpm")} />
          <Cell label="CPC" value={metricText(perf, "cpc")} />
        </div>
      </div>

      {/* 구매 전환 */}
      <div className="mt-2 rounded-md border border-slate-200 bg-white p-3">
        <p className="mb-2 text-[11px] font-bold text-slate-600">구매 전환</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <Cell label="구매" value={op.purchaseText.replace("구매 ", "").replace("데이터 확인 불가", "확인 불가")} />
          <Cell label="구매 전환값" value={rawText(perf, present, "purchaseValue", true)} tone={present && !present.includes("purchaseValue") ? "text-slate-400" : undefined} />
          <Cell label="구매전환율(CVR)" value={metricText(perf, "purchaseRate")} tone={op.cvrReference ? "text-slate-400" : undefined} />
          <Cell label="CPA" value={metricText(perf, "cpa")} />
          <Cell label="CVR 데이터" value={op.cvrReference ? "참고용" : metricVal(perf, "purchaseRate") == null ? "계산 불가" : "판단 가능"} />
        </div>
        <p className="mt-2 text-[10px] text-slate-400">{op.cvrNote}</p>
      </div>

      {/* 수익성 */}
      <div className="mt-2 rounded-md border border-slate-200 bg-white p-3">
        <p className="mb-2 text-[11px] font-bold text-slate-600">수익성</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <Cell label="ROAS" value={est == null ? "계산 불가" : formatPct(est)} tone={est == null ? "text-slate-400" : undefined} />
          <Cell label="구매 ROAS(참고)" value={metaRoasText} tone="text-slate-500" />
          <Cell label="BEP ROAS" value={bep == null ? "미입력" : formatPct(bep)} tone={bep == null ? "text-slate-400" : undefined} />
          <Cell label="BEP 대비" value={profit.diffPp == null ? (est == null ? "계산 불가" : bep == null ? "BEP 입력 필요" : "-") : diffPpText(profit.diffPp)} tone={profit.diffPp == null ? "text-slate-400" : profit.diffPp > 0 ? "text-emerald-600" : profit.diffPp < 0 ? "text-rose-600" : "text-slate-500"} />
          <Cell label="수익성 판단" value={est == null || bep == null ? "수익성 비교 불가" : profit.verdict} tone={est == null || bep == null ? "text-slate-400" : VERDICT_TONE[profit.verdict] ?? "text-slate-500"} />
        </div>
      </div>

      <div className="mt-3 flex border-t border-slate-200 pt-2">
        <button onClick={copy} className="ml-auto rounded-md bg-brand px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700">
          {copied ? "복사됨 ✓" : "보고 문구 복사"}
        </button>
      </div>
    </div>
  );
}
