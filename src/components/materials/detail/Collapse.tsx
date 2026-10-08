"use client";

// 세부 분석용 접기/펼치기 섹션 (표시 전용). 기본 접힘.
// 중요 정보(운영 판단·핵심 성과·중요 경고)는 이 컴포넌트로 감싸지 않는다.

import { useState } from "react";
import { cn } from "@/lib/cn";

export function Collapse({
  title,
  defaultOpen = false,
  right,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
          <span className={cn("text-slate-400 transition-transform", open && "rotate-90")} aria-hidden>▸</span>
          {title}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-slate-400">{right}{open ? "접기" : "펼치기"}</span>
      </button>
      {open && <div className="border-t border-slate-100 p-3">{children}</div>}
    </div>
  );
}
