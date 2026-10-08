"use client";

import type { MetricGroup, MetricResult } from "@/lib/types";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  formatChange,
  formatMetricValue,
  formatPreviousValue,
} from "@/lib/metrics/format";
import { cn } from "@/lib/cn";

function oneLine(m: MetricResult): string {
  if (m.state === "missing_column") return "CSV에 해당 원본 열이 없어 계산하지 못했습니다.";
  if (m.state === "na") return "이 소재 유형에는 적용되지 않습니다.";
  if (m.state === "no_data") return "데이터가 없어 계산할 수 없습니다.";
  if (m.state === "no_purchase") return "구매가 0건이라 계산하지 않습니다.";
  if (m.state === "cannot_calc") return "분모가 0이라 계산할 수 없습니다.";
  const c = formatChange(m);
  if (m.changeNote === "no_previous") return "이전 기간 데이터가 없어 비교할 수 없습니다.";
  if (m.changeNote === "new") return "이번 기간에 처음 발생한 값입니다.";
  if (c.tone === "positive") return "이전 기간 대비 긍정적으로 변화했습니다.";
  if (c.tone === "negative") return "이전 기간 대비 주의가 필요한 변화입니다.";
  return "이전 기간과 큰 차이가 없습니다.";
}

function MetricCard({ m }: { m: MetricResult }) {
  const change = formatChange(m);
  const toneClass =
    change.tone === "positive"
      ? "text-emerald-600"
      : change.tone === "negative"
        ? "text-rose-600"
        : "text-slate-400";
  const dim = m.state !== "ok";

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-1">
        <Tooltip
          content={
            <span>
              <b>{m.label}</b> — {m.meaning}
              <br />계산식: {m.formula}
              <br />출처: {m.source}
              <br />해석: {m.interpret}
            </span>
          }
        >
          <span className="cursor-help border-b border-dotted border-slate-400 text-[11px] font-semibold text-slate-500">
            {m.label}
          </span>
        </Tooltip>
      </div>
      <div className={cn("mt-1 text-lg font-bold", dim ? "text-slate-400" : "text-slate-900")}>
        {formatMetricValue(m)}
      </div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
        <span className="text-slate-400">
          {m.changeNote === "no_previous" ? formatPreviousValue(m) : `이전 ${formatPreviousValue(m)}`}
        </span>
        {m.changeNote !== "no_previous" && (
          <span className={cn("font-semibold", toneClass)}>{change.text}</span>
        )}
      </div>
      <p className="mt-1 clamp-2 text-[10px] leading-snug text-slate-400">{oneLine(m)}</p>
    </div>
  );
}

export function MetricGroups({ groups }: { groups: MetricGroup[] }) {
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.key}>
          <h4 className="mb-1.5 flex items-center gap-2 text-xs font-bold text-slate-600">
            <span className="h-3 w-1 rounded-full bg-brand" />
            {g.label}
          </h4>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            {g.metrics.map((m) => (
              <MetricCard key={m.key} m={m} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
