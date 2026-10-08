"use client";

import React, { useState } from "react";

// 가벼운 호버 툴팁 (외부 의존성 없이 구현)
export function Tooltip({
  content,
  children,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      tabIndex={0}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-30 mt-1 w-64 -translate-x-1/2 rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-left text-[11px] font-normal leading-relaxed text-slate-50 shadow-lg"
        >
          {content}
        </span>
      )}
    </span>
  );
}
