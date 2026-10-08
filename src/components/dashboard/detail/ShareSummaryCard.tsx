"use client";

import { useMemo, useState } from "react";
import type { AdAnalysis } from "@/lib/analysis/analyze";
import { buildShareSummary, summaryToText } from "@/lib/analysis/summary";

export function ShareSummaryCard({ analysis }: { analysis: AdAnalysis }) {
  const summary = useMemo(() => buildShareSummary(analysis), [analysis]);
  const [copied, setCopied] = useState(false);
  const [includeGraph, setIncludeGraph] = useState(true);
  const [includePreview, setIncludePreview] = useState(false);
  const [includeAnalysis, setIncludeAnalysis] = useState(true);

  const copy = async () => {
    const text = summaryToText(summary);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // 클립보드 API 미지원 폴백
      window.prompt("아래 내용을 복사하세요.", text);
    }
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="space-y-2 text-xs leading-relaxed text-slate-700">
        <p>{summary.conclusion}</p>
        <p>{summary.performance}</p>
        <p>{summary.issue}</p>
        {includeAnalysis && <p className="text-slate-500">{summary.basis}</p>}
        <p className="font-medium text-slate-800">{summary.action}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-200 pt-2 text-[11px] text-slate-500">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={includeGraph} onChange={(e) => setIncludeGraph(e.target.checked)} />
          그래프 포함
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={includePreview} onChange={(e) => setIncludePreview(e.target.checked)} />
          소재 미리보기 포함
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={includeAnalysis} onChange={(e) => setIncludeAnalysis(e.target.checked)} />
          자동 분석 포함
        </label>
        <button
          onClick={copy}
          className="ml-auto rounded-md bg-brand px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700"
        >
          {copied ? "복사됨 ✓" : "보고 문구 복사"}
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-slate-400">
        · 포함 옵션과 PDF/엑셀/CSV 내보내기는 보고서 단계(8단계)에서 실제 파일 출력에 반영됩니다. 현재는 보고 문구 복사만 동작합니다.
      </p>
    </div>
  );
}
