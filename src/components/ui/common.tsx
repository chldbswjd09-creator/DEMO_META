"use client";

import React from "react";
import type { CreativeType } from "@/lib/types";
import { cn } from "@/lib/cn";

export function Spinner({ size = 20 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-slate-300 border-t-brand"
      style={{ width: size, height: size }}
      aria-label="로딩 중"
      role="status"
    />
  );
}

export function LoadingScreen({ label = "불러오는 중입니다…" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-3 text-slate-500">
      <Spinner size={28} />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon = "◍",
}: {
  title: string;
  description?: string;
  icon?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center">
      <span aria-hidden className="text-2xl text-slate-400">
        {icon}
      </span>
      <p className="text-sm font-semibold text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-xs text-slate-500">{description}</p>}
    </div>
  );
}

export function ErrorState({
  title = "문제가 발생했습니다",
  description,
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-6 py-10 text-center">
      <span aria-hidden className="text-2xl text-rose-400">
        ⚠
      </span>
      <p className="text-sm font-semibold text-rose-700">{title}</p>
      {description && <p className="max-w-sm text-xs text-rose-600">{description}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 rounded-md border border-rose-300 bg-white px-3 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100"
        >
          다시 시도
        </button>
      )}
    </div>
  );
}

export function creativeLabel(t: CreativeType): string {
  switch (t) {
    case "image":
      return "이미지";
    case "video":
      return "영상";
    case "carousel":
      return "캐러셀";
    default:
      return "기타";
  }
}

const CREATIVE_ICON: Record<CreativeType, string> = {
  image: "🖼",
  video: "▶",
  carousel: "▤",
  other: "◦",
};

// 소재 썸네일 (미리보기 없음 → 플레이스홀더)
export function CreativeThumb({
  type,
  url,
  size = 44,
}: {
  type: CreativeType;
  url?: string;
  size?: number;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100 text-slate-400",
      )}
      style={{ width: size, height: size }}
      title={url ? undefined : "소재 미리보기 없음"}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="소재 미리보기" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden style={{ fontSize: size * 0.4 }}>
          {CREATIVE_ICON[type]}
        </span>
      )}
    </div>
  );
}
