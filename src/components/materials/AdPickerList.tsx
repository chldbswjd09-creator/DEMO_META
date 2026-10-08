"use client";

// 상세페이지 왼쪽 '광고 탐색' 리스트 — 선택/탐색 전용 compact 카드 리스트(가로 스크롤 없음).
// 성과 상세 수치는 오른쪽에서 확인한다. 여기서는 광고명·캠페인·운영상태 + ROAS/CTR 만.
// 탐색 기능 전부 유지: 광고명 검색 / 캠페인 필터 / 운영 상태 필터 / 성과 판정 필터 / 광고명·캠페인명 정렬.
// 표시/필터/정렬만 담당하며 계산·판정 로직은 사용하지 않는다(값은 props로 전달받은 기존 결과).

import { useMemo, useState } from "react";
import type { AdItem } from "@/components/materials/AdsTable";
import type { VerdictCode } from "@/lib/types";
import { findMetric } from "@/lib/metrics/calc";
import { formatMetricValue, formatPct } from "@/lib/metrics/format";
import { AD_STATUS_LABEL, AD_STATUS_OPTIONS, type AdStatus } from "@/lib/materials/adStatus";
import { compareByAd, compareByCampaign, passFilters, type AdSortKey, type StatusFilter, type VerdictFilter } from "@/lib/materials/adListView";
import { normalizeCampaign, uniqueCampaigns } from "@/lib/materials/campaign";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { cn } from "@/lib/cn";

const SELECT = "min-w-0 rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[11px] text-slate-600 outline-none focus:border-brand";

export function AdPickerList({
  items,
  selectedKey,
  onSelect,
  statusFor,
  verdictFor,
  roasFor,
  campaignFor,
}: {
  items: AdItem[];
  selectedKey?: string | null;
  onSelect: (key: string) => void;
  statusFor: (key: string) => AdStatus;
  verdictFor: (key: string) => VerdictCode | undefined;
  roasFor: (key: string) => number | null | undefined;
  campaignFor?: (key: string) => string;
}) {
  const [query, setQuery] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("all");
  const [sort, setSort] = useState<AdSortKey>("ad");

  const campaignOf = (it: AdItem) => normalizeCampaign(campaignFor ? campaignFor(it.ad.key) : it.ad.campaignName);

  // 캠페인 필터 옵션 — 실제 캠페인명(자리표시자/빈값 제외), 통합 병합의 합쳐진 문자열도 분해.
  const campaignOptions = useMemo(() => {
    const all: string[] = [];
    for (const it of items) {
      const c = campaignOf(it);
      if (c) all.push(...c.split(", "));
    }
    return uniqueCampaigns(all);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const view = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = items.filter((it) => {
      if (q && !it.ad.adName.toLowerCase().includes(q)) return false;
      if (campaignFilter !== "all") {
        const c = campaignOf(it);
        if (!c.split(", ").includes(campaignFilter)) return false;
      }
      return passFilters(statusFor(it.ad.key), verdictFor(it.ad.key), statusFilter, verdictFilter);
    });
    return [...filtered].sort((x, y) =>
      sort === "campaign"
        ? compareByCampaign(campaignOf(x), x.ad.adName, campaignOf(y), y.ad.adName)
        : compareByAd(x.ad.adName, y.ad.adName),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, campaignFilter, statusFilter, verdictFilter, sort]);

  const selectedHidden = selectedKey != null && !view.some((it) => it.ad.key === selectedKey);

  return (
    <div>
      {/* 탐색 도구 (compact) */}
      <div className="mb-2 space-y-1.5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="광고명 검색"
          className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-brand"
        />
        <div className="flex flex-wrap gap-1.5">
          <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} className={SELECT} aria-label="캠페인 필터">
            <option value="all">캠페인 전체</option>
            {campaignOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={SELECT} aria-label="운영 상태 필터">
            <option value="all">운영 전체</option>
            {AD_STATUS_OPTIONS.map((s) => <option key={s} value={s}>{AD_STATUS_LABEL[s]}</option>)}
          </select>
          <select value={verdictFilter} onChange={(e) => setVerdictFilter(e.target.value as VerdictFilter)} className={SELECT} aria-label="성과 판정 필터">
            <option value="all">판정 전체</option>
            <option value="keep">유지</option>
            <option value="pause_candidate">중단 검토</option>
            <option value="monitor">추가 관찰</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as AdSortKey)} className={SELECT} aria-label="정렬">
            <option value="ad">광고명순</option>
            <option value="campaign">캠페인명순</option>
          </select>
        </div>
      </div>

      {selectedHidden && (
        <p className="mb-1.5 rounded-md bg-amber-50 px-2 py-1 text-[10px] text-amber-600">현재 보고 있는 소재는 필터 조건에 없습니다(오른쪽 상세는 유지됩니다).</p>
      )}

      {/* 카드 리스트 (세로 스크롤) */}
      <ul className="space-y-1">
        {view.map((it) => {
          const key = it.ad.key;
          const sel = selectedKey === key;
          const status = statusFor(key);
          const dim = status === "off" || status === "deleted";
          const camp = campaignOf(it);
          const roas = roasFor(key);
          const roasText = roas == null ? "ROAS 계산 불가" : `ROAS ${formatPct(roas)}`;
          const ctr = findMetric(it.an.groups, "ctr");
          const ctrText = ctr ? `CTR ${formatMetricValue(ctr)}` : "";
          const meta = [camp || "캠페인 미등록", AD_STATUS_LABEL[status]].join(" · ");
          return (
            <li key={key}>
              <button
                type="button"
                onClick={() => onSelect(key)}
                className={cn(
                  "w-full rounded-lg border px-2.5 py-2 text-left",
                  sel ? "border-brand bg-brand/5" : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <div className="flex items-center gap-1.5">
                  {sel && <span className="shrink-0 text-brand" aria-label="선택됨">▸</span>}
                  <span className={cn("min-w-0 flex-1 truncate text-xs font-semibold", dim ? "text-slate-400" : "text-slate-800")} title={it.ad.adName}>{it.ad.adName}</span>
                  <span className="shrink-0"><VerdictBadge code={verdictFor(key) ?? it.an.verdict.code} /></span>
                </div>
                <p className="mt-0.5 truncate text-[11px] text-slate-400" title={camp || "캠페인 미등록"}>{meta}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{[roasText, ctrText].filter(Boolean).join(" · ")}</p>
              </button>
            </li>
          );
        })}
      </ul>
      {view.length === 0 && <p className="py-3 text-center text-[11px] text-slate-400">조건에 해당하는 광고가 없습니다.</p>}
    </div>
  );
}
