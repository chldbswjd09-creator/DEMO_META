// 내보내기 유틸 (브라우저). 서버 저장 없음.

import type { AnalysisSettings } from "@/lib/types";
import type { ParsedFile } from "@/lib/csv/parse";
import type { Dataset } from "@/lib/csv/dataset";
import { analyzeAdCsv } from "@/lib/csv/analyze";
import { findMetric } from "@/lib/metrics/calc";
import { VERDICT_META } from "@/lib/verdict/engine";

export function downloadFile(name: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob(["﻿" + content], { type: mime }); // UTF-8 BOM (엑셀 한글 호환)
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const head = headers.map(csvCell).join(",");
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  return `${head}\n${body}`;
}

// 업로드 원본을 재구성한 CSV (헤더 + 행)
export function reconstructCsv(file: ParsedFile): string {
  const rows = file.rows.map((r) => file.headers.map((h) => r[h] ?? ""));
  return toCsv(file.headers, rows);
}

// 분석 결과 CSV (현재 기간 광고별 지표 + 판정)
export function resultsCsv(dataset: Dataset, settings: AnalysisSettings): string {
  const headers = [
    "광고계정", "캠페인", "광고세트", "광고", "광고ID", "소재유형", "판정",
    "광고비", "노출", "도달", "CPM", "빈도", "CTR(%)", "CPC", "랜딩도달률(%)", "랜딩조회당비용",
    "구매전환율(%)", "CPA", "객단가", "ROAS(%)", "후킹률(%)", "유지율(%)", "완주율(%)", "구매", "구매매출",
  ];
  const num = (v: number | null | undefined) => (v == null ? "" : Math.round(v * 100) / 100);
  const rows: (string | number | null)[][] = [];
  for (const rec of dataset.recordsByKey.values()) {
    if (!rec.cur) continue; // 현재 기간 광고만
    const a = analyzeAdCsv(dataset, rec.key, settings);
    if (!a) continue;
    const m = (k: string) => {
      const mm = findMetric(a.groups, k);
      return mm && mm.state === "ok" ? mm.current : null;
    };
    rows.push([
      rec.accountName, rec.campaignName, rec.adSetName, rec.adName, rec.adId ?? "",
      rec.creativeType, VERDICT_META[a.verdict.code].label,
      Math.round(a.cur.spend), Math.round(a.cur.impressions), Math.round(a.cur.reach),
      num(m("cpm")), num(m("frequency")), num(m("ctr")), num(m("cpc")), num(m("landingRate")), num(m("landingCost")),
      num(m("purchaseRate")), num(m("cpa")), num(m("aov")), num(m("roas")), num(m("hookRate")), num(m("holdRate")), num(m("completionRate")),
      Math.round(a.cur.purchases), Math.round(a.cur.purchaseValue),
    ]);
  }
  return toCsv(headers, rows);
}
