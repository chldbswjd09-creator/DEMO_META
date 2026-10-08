"use client";

import { useMemo, useState } from "react";
import type { MaterialAdRow } from "@/lib/materials/types";
import type { CsvAdAnalysis } from "@/lib/csv/analyze";
import type { VerdictCode } from "@/lib/types";
import { AD_STATUS_LABEL, type AdStatus } from "@/lib/materials/adStatus";
import { compareByCampaign } from "@/lib/materials/adListView";
import { normalizeCampaign } from "@/lib/materials/campaign";
import { naturalCompare } from "@/lib/natural";
import { findMetric } from "@/lib/metrics/calc";
import { formatKRW, formatMetricValue, formatPct } from "@/lib/metrics/format";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { creativeLabel } from "@/components/ui/common";
import { cn } from "@/lib/cn";

export interface AdItem {
  ad: MaterialAdRow;
  an: CsvAdAnalysis;
}

// 구매전환율 표시 규칙: 값 있으면 %, 열 없음/랜딩0/구매열 없음 → '계산 불가', 구매 0(랜딩>0)이면 0.0%
function convRateText(an: CsvAdAnalysis): string {
  const m = findMetric(an.groups, "purchaseRate");
  if (m && m.state === "ok" && m.current !== null) return formatPct(m.current);
  return "계산 불가";
}

function metricText(an: CsvAdAnalysis, key: string): string {
  const m = findMetric(an.groups, key);
  return m ? formatMetricValue(m) : "-";
}

function roasCell(an: CsvAdAnalysis, key: string, roasFor?: (key: string) => number | null | undefined): string {
  if (roasFor) {
    const v = roasFor(key);
    return v == null ? "계산 불가" : formatPct(v);
  }
  return metricText(an, "roas");
}

// 유형 정렬 순위: 이미지 → 영상 → 캐러셀, 기타/확인 불가는 항상 뒤.
function typeRank(t: string): number {
  return t === "image" ? 0 : t === "video" ? 1 : t === "carousel" ? 2 : 99;
}

type SortCol = "ad" | "type" | "campaign" | "spend" | "cpm" | "ctr" | "cpc" | "purchaseRate" | "roas" | null;
const NUMERIC_COLS = new Set(["spend", "cpm", "ctr", "cpc", "purchaseRate", "roas"]);

export function AdsTable({
  items,
  selectedKey,
  onSelect,
  showVerdict,
  verdictFor,
  roasFor,
  sortable,
  statusFor,
  onStatusChange,
  showCampaign,
  campaignFor,
}: {
  items: AdItem[];
  selectedKey?: string | null;
  onSelect: (key: string) => void;
  showVerdict?: boolean;
  verdictFor?: (key: string) => VerdictCode | undefined;
  roasFor?: (key: string) => number | null | undefined;
  // 통합 광고 비교용: 정렬(광고/유형) + 운영 상태 컬럼
  sortable?: boolean;
  statusFor?: (key: string) => AdStatus;
  onStatusChange?: (key: string, status: AdStatus) => void;
  // 캠페인 컬럼 표시(선택). campaignFor 로 표시 문자열을 주면 그것을, 없으면 ad.campaignName 을 사용한다.
  showCampaign?: boolean;
  campaignFor?: (key: string) => string;
}) {
  const [sort, setSort] = useState<{ col: SortCol; dir: "asc" | "desc" }>({ col: null, dir: "asc" });
  const showStatus = Boolean(statusFor && onStatusChange);
  const campaignOf = (it: AdItem) => normalizeCampaign(campaignFor ? campaignFor(it.ad.key) : it.ad.campaignName);

  // 숫자형 컬럼 정렬값 — 기존 계산 결과만 읽는다(광고비=원본, 나머지=지표 엔진, ROAS는 roasFor 우선).
  const numVal = (it: AdItem, col: string): number | null => {
    if (col === "spend") return it.an.cur.spend;
    if (col === "roas") {
      if (roasFor) { const v = roasFor(it.ad.key); if (v !== undefined) return v ?? null; }
      const m = findMetric(it.an.groups, "roas");
      return m && m.state === "ok" && m.current != null ? m.current : null;
    }
    const m = findMetric(it.an.groups, col);
    return m && m.state === "ok" && m.current != null ? m.current : null;
  };

  const sorted = useMemo(() => {
    if (!sortable || !sort.col) return items;
    const dir = sort.dir === "asc" ? 1 : -1;
    const col = sort.col;
    const copy = [...items];
    copy.sort((x, y) => {
      if (col === "ad") return naturalCompare(x.ad.adName, y.ad.adName) * dir;
      if (col === "campaign") return compareByCampaign(campaignOf(x), x.ad.adName, campaignOf(y), y.ad.adName) * dir;
      if (NUMERIC_COLS.has(col)) {
        // 숫자 기준 정렬(문자열 아님). 계산 불가/열 없음(null)은 방향과 무관하게 항상 뒤로.
        const a = numVal(x, col);
        const b = numVal(y, col);
        if (a == null && b == null) return 0;
        if (a == null) return 1;
        if (b == null) return -1;
        return (a - b) * dir;
      }
      // type: 기타(99)는 방향과 무관하게 항상 뒤
      const rx = typeRank(x.ad.creativeType);
      const ry = typeRank(y.ad.creativeType);
      const ox = rx === 99 ? 1 : 0;
      const oy = ry === 99 ? 1 : 0;
      if (ox !== oy) return ox - oy;
      return (rx - ry) * dir;
    });
    return copy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, sortable, sort]);

  const toggle = (col: Exclude<SortCol, null>) =>
    setSort((s) => (s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" }));
  const arrow = (col: Exclude<SortCol, null>) => (sort.col === col ? (sort.dir === "asc" ? " ↑" : " ↓") : "");

  const Th = ({ col, label, right }: { col: Exclude<SortCol, null>; label: string; right?: boolean }) => {
    const cls = cn("py-1.5 pr-2 font-medium", right && "text-right");
    return sortable ? (
      <th className={cls}>
        <button onClick={() => toggle(col)} className="whitespace-nowrap hover:text-slate-700">{label}{arrow(col)}</button>
      </th>
    ) : (
      <th className={cls}>{label}</th>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-xs", showCampaign ? "min-w-[800px]" : "min-w-[680px]")}>
        <thead>
          <tr className="border-b border-slate-200 text-left text-[11px] text-slate-500">
            <Th col="ad" label="광고" />
            {showCampaign && <Th col="campaign" label="캠페인" />}
            <Th col="type" label="유형" />
            <Th col="spend" label="광고비" right />
            <Th col="cpm" label="CPM" right />
            <Th col="ctr" label="CTR" right />
            <Th col="cpc" label="CPC" right />
            <Th col="purchaseRate" label="CVR" right />
            <Th col="roas" label="ROAS" right />
            {showVerdict && <th className="py-1.5 pr-2 font-medium">판정</th>}
            {showStatus && <th className="py-1.5 pr-2 font-medium">운영 상태</th>}
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ ad, an }) => {
            const sel = selectedKey === ad.key;
            const status = statusFor?.(ad.key) ?? "active";
            const dim = showStatus && (status === "off" || status === "deleted");
            return (
              <tr
                key={ad.key}
                onClick={() => onSelect(ad.key)}
                className={cn(
                  "cursor-pointer border-b border-slate-100 border-l-2",
                  sel ? "border-l-brand bg-brand/5 font-semibold" : "border-l-transparent hover:bg-slate-50",
                  dim && !sel && "bg-slate-50/60 text-slate-400",
                )}
              >
                <td className="max-w-[220px] py-1.5 pr-2">
                  <span className="flex items-center gap-1">
                    {sel && <span className="text-brand" aria-label="선택됨">▸</span>}
                    <span className="clamp-1" title={ad.adName}>{ad.adName}</span>
                    {dim && <span className="shrink-0 rounded bg-slate-200 px-1 py-0.5 text-[9px] font-medium text-slate-500">{AD_STATUS_LABEL[status]}</span>}
                  </span>
                  <span className="text-[10px] font-normal text-slate-400">{ad.adId ?? "(ID 없음)"}</span>
                </td>
                {showCampaign && (() => {
                  const c = campaignOf({ ad, an });
                  return (
                    <td className="max-w-[150px] py-1.5 pr-2">
                      <span className={cn("clamp-1", c ? "text-slate-600" : "text-slate-400")} title={c || "캠페인명 미등록"}>
                        {c || "미등록"}
                      </span>
                    </td>
                  );
                })()}
                <td className="py-1.5 pr-2 text-slate-500">{creativeLabel(ad.creativeType)}</td>
                <td className="py-1.5 pr-2 text-right">{formatKRW(an.cur.spend)}</td>
                <td className="py-1.5 pr-2 text-right">{metricText(an, "cpm")}</td>
                <td className="py-1.5 pr-2 text-right">{metricText(an, "ctr")}</td>
                <td className="py-1.5 pr-2 text-right">{metricText(an, "cpc")}</td>
                <td className="py-1.5 pr-2 text-right">{convRateText(an)}</td>
                <td className="py-1.5 pr-2 text-right">{roasCell(an, ad.key, roasFor)}</td>
                {showVerdict && (
                  <td className="py-1.5 pr-2"><VerdictBadge code={verdictFor?.(ad.key) ?? an.verdict.code} /></td>
                )}
                {showStatus && (
                  <td className="py-1.5 pr-2" onClick={(e) => e.stopPropagation()}>
                    <select
                      value={status}
                      onChange={(e) => onStatusChange!(ad.key, e.target.value as AdStatus)}
                      className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-600 outline-none focus:border-brand"
                    >
                      <option value="active">집행 중</option>
                      <option value="off">OFF 처리</option>
                      <option value="deleted">삭제됨</option>
                    </select>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
