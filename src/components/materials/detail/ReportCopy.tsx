"use client";

// ⑥ 보고용 기능 — 하단에 작게. 기존 ShareSummary(보고 문구 생성/복사 로직)를 그대로 재사용한다.
// 노출 방식만 정리: 기본 접힘, '보고 문구 보기'를 누르면 기존 공유용 요약이 펼쳐진다.

import { useState } from "react";
import { cn } from "@/lib/cn";

export function ReportCopy({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-xs font-semibold text-slate-500">보고용</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
          aria-expanded={open}
        >
          {open ? "보고 문구 접기" : "보고 문구 보기"}
        </button>
      </div>
      <div className={cn(open ? "block border-t border-slate-100 p-3" : "hidden")}>{children}</div>
    </section>
  );
}
