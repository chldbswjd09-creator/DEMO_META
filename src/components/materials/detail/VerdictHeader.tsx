"use client";

// ① 소재 헤더 + ② 운영 판단 — 상세 최상단. 판단/수치는 기존 결과를 그대로 표시(재계산·재판정 없음).
// 중요 상태(경고/판정/BEP 미입력/데이터 부족)는 항상 노출한다(접지 않음).

import type { CreativeType, VerdictCode } from "@/lib/types";
import { VERDICT_META } from "@/lib/verdict/engine";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { creativeLabel } from "@/components/ui/common";
import { cn } from "@/lib/cn";

const PROFIT_TONE: Record<string, string> = {
  "BEP 초과": "border-emerald-300 bg-emerald-50 text-emerald-700",
  "BEP 미달": "border-rose-300 bg-rose-50 text-rose-700",
  손익분기: "border-slate-300 bg-slate-100 text-slate-700",
};

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{children}</span>;
}

export function VerdictHeader({
  name,
  campaign,
  creativeType,
  adStatus,
  periodLabel,
  elapsedDays,
  isNew,
  creativeAutoNote,
  verdictCode,
  actionSentence,
  profitVerdict,
  dataSufficiency,
  confidence,
  caution,
  alerts = [],
}: {
  name: string;
  campaign?: string | null;
  creativeType: CreativeType;
  adStatus?: string | null;
  periodLabel?: string | null;
  elapsedDays?: number | null;
  isNew?: boolean;
  creativeAutoNote?: string | null;
  verdictCode: VerdictCode;
  actionSentence?: string | null;
  profitVerdict?: string | null;
  dataSufficiency?: string | null;
  confidence?: string | null;
  caution?: string | null;
  alerts?: string[];
}) {
  const sub: string[] = [];
  if (campaign) sub.push(campaign);
  sub.push(creativeLabel(creativeType));
  if (adStatus) sub.push(adStatus);
  if (periodLabel) sub.push(elapsedDays != null ? `${periodLabel} (${elapsedDays}일)` : periodLabel);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      {/* ① 소재 헤더 */}
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-bold text-slate-900" title={name}>{name}</h2>
            {isNew && <span className="rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">신규 광고</span>}
          </div>
          <p className="mt-0.5 truncate text-[11px] text-slate-500" title={sub.join(" · ")}>{sub.join(" · ")}</p>
        </div>
      </div>
      {creativeAutoNote && <p className="mt-1 text-[11px] text-amber-600">{creativeAutoNote}</p>}

      {/* ② 운영 판단 */}
      <div className="mt-3 border-t border-slate-100 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-medium text-slate-400">운영 판단</span>
          <VerdictBadge code={verdictCode} size="md" />
          {profitVerdict && (
            <span className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-400">수익성</span>
              <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", PROFIT_TONE[profitVerdict] ?? "border-slate-300 bg-slate-100 text-slate-500")}>{profitVerdict}</span>
            </span>
          )}
          {dataSufficiency && <Chip>데이터 {dataSufficiency}</Chip>}
          {confidence && <Chip>신뢰도 {confidence}</Chip>}
        </div>
        <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-800">{VERDICT_META[verdictCode].label}{actionSentence ? ` — ${actionSentence}` : ""}</p>
        {alerts.map((a, i) => (
          <p key={i} className="mt-1.5 rounded-md bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-700">{a}</p>
        ))}
        {caution && <p className="mt-1.5 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-700">주의: {caution}</p>}
      </div>
    </section>
  );
}
