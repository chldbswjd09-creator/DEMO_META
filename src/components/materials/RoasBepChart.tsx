"use client";

// 개별 소재 ROAS vs BEP ROAS. 추정 ROAS(막대) · BEP ROAS(기준선) · Meta ROAS(참고 점선).
// 숫자(추정/BEP/BEP 대비/판정)를 그래프와 함께 항상 노출. 값 없음은 0%로 그리지 않는다.

import type { ProfitVerdict } from "@/lib/materials/profit";
import { formatPct } from "@/lib/metrics/format";
import { diffPpText } from "@/lib/materials/profitCopy";
import { cn } from "@/lib/cn";

// 그래프에 필요한 최소 값만 받는다 (단일 소재 AdProfitView / 통합 MergedAd 모두 호환)
export interface RoasBepData {
  estimatedRoas: number | null;
  bepRoas: number | null;
  diffPp: number | null;
  verdict: ProfitVerdict;
  metaRoas: number | null;
}

const VERDICT_TONE: Record<string, string> = {
  "BEP 초과": "text-emerald-700 bg-emerald-50 border-emerald-300",
  "BEP 미달": "text-rose-700 bg-rose-50 border-rose-300",
  손익분기: "text-slate-700 bg-slate-100 border-slate-300",
};
const BAR_TONE: Record<string, string> = {
  "BEP 초과": "bg-emerald-500",
  "BEP 미달": "bg-rose-500",
  손익분기: "bg-slate-400",
};

function Num({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={cn("truncate text-sm font-bold", tone ?? "text-slate-800")}>{value}</p>
    </div>
  );
}

export function RoasBepChart({ p }: { p: RoasBepData }) {
  const est = p.estimatedRoas;
  const bep = p.bepRoas;
  const meta = p.metaRoas;
  const diffTone = p.diffPp == null ? "text-slate-500" : p.diffPp > 0 ? "text-emerald-600" : p.diffPp < 0 ? "text-rose-600" : "text-slate-500";

  const scaleMax = Math.max(100, est ?? 0, bep ?? 0, meta ?? 0) * 1.08;
  const pct = (v: number | null) => (v == null ? null : Math.min(100, (v / scaleMax) * 100));
  const estPct = pct(est);
  const bepPct = pct(bep);
  const metaPct = pct(meta);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-bold text-slate-700">ROAS vs BEP ROAS</h3>

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Num label="추정 ROAS" value={est == null ? "계산 불가" : formatPct(est)} tone={est == null ? "text-slate-400" : undefined} />
        <Num label="BEP ROAS" value={bep == null ? "계산 불가" : formatPct(bep)} tone={bep == null ? "text-slate-400" : undefined} />
        <Num label="BEP 대비" value={p.diffPp == null ? "-" : diffPpText(p.diffPp)} tone={diffTone} />
        <div className="min-w-0">
          <p className="text-[10px] text-slate-400">수익성 판정</p>
          <span className={cn("mt-0.5 inline-block rounded-full border px-2 py-0.5 text-xs font-semibold", VERDICT_TONE[p.verdict] ?? "border-slate-300 bg-slate-100 text-slate-500")}>{p.verdict}</span>
        </div>
      </div>

      {/* 그래프 */}
      {est != null ? (
        <div className="mt-4">
          <div className="relative h-5 w-full overflow-hidden rounded bg-slate-100">
            <div className={cn("h-full rounded", BAR_TONE[p.verdict] ?? "bg-slate-400")} style={{ width: `${estPct}%` }} />
            {bepPct != null && <div className="absolute top-0 h-full border-l-2 border-slate-700" style={{ left: `${bepPct}%` }} title={`BEP ROAS ${formatPct(bep as number)}`} />}
            {metaPct != null && <div className="absolute top-0 h-full border-l-2 border-dotted border-sky-500" style={{ left: `${metaPct}%` }} title={`Meta ROAS ${formatPct(meta as number)}`} />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-slate-500">
            <span className="flex items-center gap-1"><span className={cn("inline-block h-2 w-2 rounded-sm", BAR_TONE[p.verdict] ?? "bg-slate-400")} />추정 ROAS</span>
            <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-0.5 bg-slate-700" />BEP ROAS</span>
            {meta != null && <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-0.5 border-l-2 border-dotted border-sky-500" />Meta ROAS {formatPct(meta)} (참고)</span>}
          </div>
          {bep == null && <p className="mt-2 rounded-md bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500">BEP ROAS가 입력되지 않았습니다. 메인 화면에서 BEP ROAS를 입력하면 추정 ROAS와 비교합니다.</p>}
        </div>
      ) : (
        <div className="mt-4 rounded-md bg-slate-50 px-3 py-3 text-[11px] text-slate-500">
          <p>CSV에 구매 매출 데이터가 없어 추정 ROAS를 계산할 수 없습니다. 수익성 비교가 불가합니다.</p>
          {meta != null && <p className="mt-1 text-slate-400">참고값 Meta ROAS {formatPct(meta)}만 확인할 수 있습니다.</p>}
        </div>
      )}
    </section>
  );
}
