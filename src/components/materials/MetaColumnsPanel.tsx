"use client";

// 메타 열 설정 안내 패널 — 메타 광고 관리자에서 CSV를 내보내기 전 '열 맞춤 설정'에
// 반드시 지정해야 하는 열 목록을 보여준다. 체크는 설정 진행 상황 메모용(이 브라우저에만 저장).

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

// 메타에서 지정해야 하는 열 (사용자 지정 순서 그대로 유지)
export const META_COLUMNS: string[] = [
  "게재",
  "조치",
  "노출",
  "링크 클릭",
  "CTR(전체)",
  "CPC(링크 클릭당 비용)",
  "지출 금액",
  "구매",
  "구매 전환값",
  "구매 ROAS(광고 지출 대비 수익률)",
  "결과",
  "결과당 비용",
  "예산",
  "빈도",
  "CPM(1,000회 노출당 비용)",
  "광고 일정",
  "종료",
  "최근 영향이 큰 변경",
  "광고 세트 이름",
  "랜딩 페이지 조회",
  "랜딩 페이지 조회당 비용",
  "장바구니에 담기",
  "장바구니에 담기당 비용",
  "구매당 비용",
  "CPC(전체)",
  "캠페인 이름",
  "캠페인 ID",
  "광고 세트 ID",
  "광고 ID",
  "기여 설정",
  "보고 시작",
  "보고 종료",
  "도달",
  "동영상 재생",
  "동영상 3초 이상 재생",
  "동영상 평균 재생 시간",
  "동영상 25% 재생",
  "동영상 50% 재생",
  "동영상 75% 재생",
  "동영상 95% 재생",
  "동영상 100% 재생",
];

const STORAGE_KEY = "metaColumnsChecked";

export function MetaColumnsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [mounted, setMounted] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);

  useEffect(() => setMounted(true), []);

  // 체크 상태 복원(이 브라우저에만 저장, 실패해도 무시)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setChecked(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const save = (next: Record<string, boolean>) => {
    setChecked(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };
  const toggle = (c: string) => save({ ...checked, [c]: !checked[c] });
  const reset = () => save({});
  const doneCount = META_COLUMNS.filter((c) => checked[c]).length;

  const copyList = () => {
    const text = META_COLUMNS.join("\n");
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }).catch(() => {});
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="메타 열 설정"
    >
      <div className="my-4 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-pop" onClick={(e) => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-base font-bold text-slate-800">메타 열 설정</h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
              메타 광고 관리자에서 CSV를 내보내기 전, <span className="font-semibold text-slate-600">열 맞춤 설정</span>에 아래 열을 모두 지정하세요.
              이 열들이 있어야 대시보드가 정상적으로 분석됩니다.
            </p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="닫기">✕</button>
        </div>

        {/* 진행/액션 */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-5 py-2.5">
          <span className="text-[11px] text-slate-500">
            총 <span className="font-semibold text-slate-700">{META_COLUMNS.length}</span>개
            {doneCount > 0 && <> · 체크 <span className="font-semibold text-brand">{doneCount}</span>개</>}
          </span>
          <div className="flex items-center gap-2">
            {doneCount > 0 && (
              <button onClick={reset} className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-50">체크 초기화</button>
            )}
            <button onClick={copyList} className="rounded-md border border-brand/40 bg-brand/5 px-2.5 py-1 text-[11px] font-medium text-brand hover:bg-brand/10">
              {copied ? "복사됨 ✓" : "목록 복사"}
            </button>
          </div>
        </div>

        {/* 열 목록 */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          <ol className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {META_COLUMNS.map((c, i) => (
              <li key={c}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={!!checked[c]}
                    onChange={() => toggle(c)}
                    className="h-3.5 w-3.5 shrink-0 accent-brand"
                  />
                  <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-slate-300">{i + 1}</span>
                  <span className={cn("leading-tight", checked[c] ? "text-slate-400 line-through" : "text-slate-700")}>{c}</span>
                </label>
              </li>
            ))}
          </ol>
        </div>

        {/* 푸터 */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
          <p className="text-[10px] text-slate-400">열 이름은 메타 광고 관리자(한국어) 기준입니다. 체크는 이 브라우저에만 저장됩니다.</p>
          <button onClick={onClose} className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark">닫기</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
