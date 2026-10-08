"use client";

import type { AdRow } from "@/lib/services/api";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { formatKRW, formatPct } from "@/lib/metrics/format";
import { creativeLabel } from "@/components/ui/common";
import { cn } from "@/lib/cn";

// 같은 광고세트 내 광고 비교
export function SetComparison({ rows, selectedId }: { rows: AdRow[]; selectedId: string }) {
  if (rows.length <= 1) {
    return <p className="text-xs text-slate-400">비교할 다른 광고가 없습니다.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
            <th className="py-1.5 pr-2 font-medium">광고</th>
            <th className="py-1.5 pr-2 font-medium">유형</th>
            <th className="py-1.5 pr-2 text-right font-medium">광고비</th>
            <th className="py-1.5 pr-2 text-right font-medium">CPA</th>
            <th className="py-1.5 pr-2 text-right font-medium">ROAS</th>
            <th className="py-1.5 pr-2 text-right font-medium">CTR</th>
            <th className="py-1.5 pr-2 font-medium">판정</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => {
            const r = a.rollup;
            const isSel = a.id === selectedId;
            return (
              <tr
                key={a.id}
                className={cn("border-b border-slate-100", isSel && "bg-brand/5 font-semibold")}
              >
                <td className="max-w-[180px] py-1.5 pr-2">
                  <span className="flex items-center gap-1">
                    {isSel && <span className="text-brand" aria-label="선택됨">▸</span>}
                    <span className="clamp-1" title={a.name}>
                      {a.name}
                    </span>
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-slate-500">{creativeLabel(a.creativeType)}</td>
                <td className="py-1.5 pr-2 text-right">{formatKRW(r.spend)}</td>
                <td className="py-1.5 pr-2 text-right">
                  {r.cpa === null ? (r.purchases === 0 ? "구매 없음" : "-") : formatKRW(r.cpa)}
                </td>
                <td className="py-1.5 pr-2 text-right">{r.roas === null ? "계산 불가" : formatPct(r.roas, 0)}</td>
                <td className="py-1.5 pr-2 text-right">{r.ctr === null ? "-" : formatPct(r.ctr)}</td>
                <td className="py-1.5 pr-2">
                  <VerdictBadge code={r.verdictCode} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
