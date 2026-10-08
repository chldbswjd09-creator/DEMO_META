"use client";

import type { AggregatedInsight } from "@/lib/types";
import type { PerfField } from "@/lib/csv/columnMap";
import { computeDropoff } from "@/lib/materials/videoDropoff";
import { formatPct } from "@/lib/metrics/format";
import { cn } from "@/lib/cn";

export function VideoDropoff({
  agg,
  present,
  isVideo,
}: {
  agg: AggregatedInsight;
  present: PerfField[];
  isVideo: boolean;
}) {
  const r = computeDropoff(agg, present, isVideo);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-slate-700">영상 구간별 이탈 분석</h3>
      {!r.applicable ? (
        <p className="text-xs text-slate-400">적용 대상 아님</p>
      ) : !r.hasData ? (
        <p className="text-xs text-slate-400">영상 구간 데이터 없음</p>
      ) : (
        <>
          <table className="w-full max-w-md text-xs">
            <tbody>
              {r.segments.map((s) => (
                <tr key={s.label} className={cn("border-b border-slate-100", s.isMax && "bg-rose-50")}>
                  <td className="py-1.5 pr-2 text-slate-600">{s.label}</td>
                  <td className="py-1.5 pr-2 text-right font-semibold text-slate-800">
                    {s.computable && s.dropRate !== null ? formatPct(s.dropRate) : <span className="text-slate-300">계산 불가</span>}
                  </td>
                  <td className="py-1.5 pl-2">
                    {s.isMax && <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">최대 이탈</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {r.advice && <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-600">자동 분석: {r.advice}</p>}
          <p className="mt-1 text-[10px] text-slate-400">영상 길이를 알 수 없어 정확한 초가 아니라 재생 비율(25%/50%/75%…) 구간으로 표시합니다.</p>
        </>
      )}
    </section>
  );
}
