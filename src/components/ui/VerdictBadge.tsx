// 성과 판정 배지 — 색상에만 의존하지 않고 텍스트+아이콘+색상 3중 표기

import type { VerdictCode } from "@/lib/types";
import { VERDICT_META } from "@/lib/verdict/engine";
import { cn } from "@/lib/cn";

const TONE_CLASS: Record<string, string> = {
  good: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  bad: "bg-rose-50 text-rose-800 border-rose-200",
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
};

export function VerdictBadge({
  code,
  size = "sm",
}: {
  code: VerdictCode;
  size?: "sm" | "md";
}) {
  const meta = VERDICT_META[code];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-semibold shadow-soft",
        TONE_CLASS[meta.tone],
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
      )}
      title={meta.label}
    >
      <span aria-hidden className="leading-none">
        {meta.icon}
      </span>
      <span>{meta.label}</span>
    </span>
  );
}
