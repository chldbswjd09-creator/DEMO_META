"use client";

import { useMemo, useRef, useState } from "react";
import { useMaterials } from "@/components/providers/MaterialsProvider";
import { buildMaterialAnalysis, metricGroupsForAgg } from "@/lib/materials/compute";
import { findMetric } from "@/lib/metrics/calc";
import type { Material } from "@/lib/materials/types";
import { toCsv, downloadFile } from "@/lib/csv/exporters";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { Logo } from "@/components/ui/Logo";
import { MetaColumnsPanel } from "@/components/materials/MetaColumnsPanel";
import { LoadingScreen, Spinner, EmptyState } from "@/components/ui/common";
import { formatKRW, formatNumber, formatPct, formatDate, formatMetricValue } from "@/lib/metrics/format";
import { naturalCompare } from "@/lib/natural";
import { uniqueCampaigns, displayCampaign, campaignMatches } from "@/lib/materials/campaign";
import { resetSampleData } from "@/lib/materials/store";
import { cn } from "@/lib/cn";

function bytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function UploadZone() {
  const { startUpload, busy, progress } = useMaterials();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) startUpload(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className={cn("flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center", drag ? "border-brand bg-brand/5" : "border-slate-300 hover:border-brand/50 hover:bg-slate-50")}
    >
      {busy ? <div className="flex items-center gap-2 text-xs text-slate-500"><Spinner size={14} />{progress}</div> : (
        <>
          <span aria-hidden className="text-2xl text-slate-300">⤓</span>
          <p className="mt-1 text-sm text-slate-600">CSV 파일을 드래그하거나 클릭해 새 분석 자료 만들기</p>
          <p className="text-[10px] text-slate-400">CSV 한 개 = 분석 자료 한 개 · UTF-8/CP949 · 쉼표/탭</p>
        </>
      )}
      <input ref={inputRef} type="file" accept=".csv,.tsv,text/csv" className="hidden" onChange={(e) => { if (e.target.files) startUpload(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

export function LibraryScreen() {
  const {
    loaded, materials, settings, storage, selected, toggleSelect, selectMany, clearSelection, goSelectionView,
    openDetail, rename, updateMeta, remove, clearAll, backup, restore, error,
  } = useMaterials();
  const restoreRef = useRef<HTMLInputElement>(null);
  const resetDemo = () => {
    // 데모: 샘플 데이터로 초기화(브라우저 로컬 저장소 재시드) 후 새로고침.
    if (confirm("샘플 데이터로 초기화할까요? 현재 입력·수정 내용이 사라집니다.")) {
      resetSampleData();
      window.location.reload();
    }
  };
  const [query, setQuery] = useState(""); // 입력창 값
  const [applied, setApplied] = useState(""); // 실제 적용된 검색어
  const [searchField, setSearchField] = useState<"name" | "campaign">("name"); // 검색 기준 선택
  const [appliedField, setAppliedField] = useState<"name" | "campaign">("name"); // 실제 적용된 검색 기준
  const [nameSort, setNameSort] = useState<"none" | "asc" | "desc">("none"); // 이름 정렬(displayName, natural)
  const [colsOpen, setColsOpen] = useState(false); // 메타 열 설정 안내 패널

  const analyses = useMemo(() => new Map(materials.map((m) => [m.id, buildMaterialAnalysis(m, settings)])), [materials, settings]);

  // 자료의 CSV 캠페인명(광고 row에서 유도, 고유) — 표시/검색 공용.
  const csvCampaignsOf = (id: string) => {
    const a = analyses.get(id);
    return a ? uniqueCampaigns(a.ads.map((ad) => ad.campaignName)) : [];
  };

  // 검색: 기준(파일명/캠페인명)에 따라 부분일치(대소문자 무시). 파일명=이름+원본파일명, 캠페인명=CSV+수기.
  // 선택 상태는 유지(검색은 표시만 필터). 검색 버튼/Enter로만 적용된다.
  // 이름 정렬은 표시 순서만 바꾼다(검색/선택 불변). displayName(m.name) 기준 natural sort.
  const filtered = useMemo(() => {
    const q = applied.trim().toLowerCase();
    const base = !q
      ? materials
      : materials.filter((m) => {
          if (appliedField === "campaign") {
            return campaignMatches(q, csvCampaignsOf(m.id), m.manualCampaignName);
          }
          return m.name.toLowerCase().includes(q) || m.file.name.toLowerCase().includes(q);
        });
    if (nameSort === "none") return base;
    const dir = nameSort === "asc" ? 1 : -1;
    return [...base].sort((a, b) => naturalCompare(a.name, b.name) * dir);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materials, applied, appliedField, nameSort, analyses]);
  const filteredIds = filtered.map((m) => m.id);
  const runSearch = () => { setApplied(query.trim()); setAppliedField(searchField); };
  const toggleNameSort = () => setNameSort((s) => (s === "asc" ? "desc" : "asc"));

  if (!loaded) return <LoadingScreen label="저장된 분석 자료를 불러오는 중…" />;

  const exportMaterialJson = (m: Material) => downloadFile(`${m.name}.json`, JSON.stringify(m, null, 2), "application/json");
  const exportOriginalCsv = (m: Material) => downloadFile(`원본_${m.name}.csv`, toCsv(m.headers, m.rows.map((r) => m.headers.map((h) => r[h] ?? ""))));

  const onRestore = async (file: File) => {
    try { await restore(JSON.parse(await file.text())); } catch { alert("백업 파일을 읽지 못했습니다."); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 px-5 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2">
          <Logo size={34} title="광고 성과 분석" subtitle="분석 자료" />
          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">DEMO</span>
          <div className="ml-auto flex items-center gap-1.5 text-[11px]">
            {storage && <span className="mr-1 hidden text-slate-400 sm:inline">저장 사용량 {bytes(storage.usage)}{storage.quota ? ` / ${bytes(storage.quota)}` : ""}</span>}
            <button onClick={() => setColsOpen(true)} className="rounded-lg border border-brand/40 bg-brand/5 px-2.5 py-1.5 font-medium text-brand shadow-soft hover:bg-brand/10">열 설정</button>
            <button onClick={backup} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 shadow-soft hover:border-slate-300 hover:text-slate-800">전체 JSON 백업</button>
            <button onClick={() => restoreRef.current?.click()} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-600 shadow-soft hover:border-slate-300 hover:text-slate-800">백업 불러오기</button>
            <input ref={restoreRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { if (e.target.files?.[0]) onRestore(e.target.files[0]); e.target.value = ""; }} />
            <button onClick={() => { if (materials.length && confirm("모든 분석 자료를 삭제합니다. 되돌릴 수 없습니다.")) clearAll(); }} className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 font-medium text-rose-600 shadow-soft hover:bg-rose-50">전체 삭제</button>
            <button onClick={resetDemo} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 font-medium text-slate-500 shadow-soft hover:border-slate-300 hover:text-slate-700">샘플 초기화</button>
          </div>
        </div>
      </header>

      <MetaColumnsPanel open={colsOpen} onClose={() => setColsOpen(false)} />

      <main className="mx-auto max-w-6xl px-5 py-5">
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          📊 <span className="font-semibold">포트폴리오 데모 — 샘플 데이터입니다 (실제 업무 데이터가 아닙니다).</span>{" "}
          입력·수정 내용은 이 브라우저에만 저장되며 다른 사용자와 공유되지 않습니다. 우측 상단 <span className="font-medium">‘샘플 초기화’</span>로 언제든 되돌릴 수 있습니다.
        </div>

        <UploadZone />
        {error && <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

        {/* 검색 + 선택 도구 */}
        {materials.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* form submit(Enter) → 새로고침 없이 검색 함수만 실행 */}
            <form onSubmit={(e) => { e.preventDefault(); runSearch(); }} className="flex min-w-[300px] flex-1 items-center gap-2">
              <select
                value={searchField}
                onChange={(e) => setSearchField(e.target.value as "name" | "campaign")}
                aria-label="검색 기준"
                className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-600 outline-none focus:border-brand"
              >
                <option value="name">파일명</option>
                <option value="campaign">캠페인명</option>
              </select>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
                placeholder={searchField === "campaign" ? "캠페인명 검색" : "분석 자료 이름 검색"}
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-brand"
              />
              <button type="submit" className="shrink-0 rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">검색</button>
            </form>
            <button onClick={() => selectMany(filteredIds, true)} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50">검색 결과 전체 선택</button>
            <button onClick={() => selectMany(filteredIds, false)} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50">검색 결과 선택 해제</button>
            <button onClick={() => selectMany(materials.map((m) => m.id), false)} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50">전체 선택 해제</button>
          </div>
        )}
        {applied && <p className="mt-1.5 text-[11px] text-slate-500">{appliedField === "campaign" ? "캠페인명" : "파일명"} &lsquo;{applied}&rsquo; 검색 결과 {filtered.length}개 · 검색창을 비우고 검색하면 전체가 표시됩니다.</p>}

        {/* 선택 액션 바 */}
        {selected.length > 0 && (
          <div className="sticky top-2 z-10 mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2">
            <span className="text-xs font-semibold text-brand">{selected.length}개 자료 선택됨</span>
            <button onClick={() => goSelectionView("integrated")} disabled={selected.length < 2} className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">선택 자료 통합 분석</button>
            <button onClick={() => goSelectionView("period")} disabled={selected.length < 2} className="rounded-md border border-brand/40 bg-white px-3 py-1.5 text-xs font-semibold text-brand hover:bg-brand/5 disabled:opacity-50">기간 비교 (A/B)</button>
            <button onClick={() => goSelectionView("compare")} disabled={selected.length < 2} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50">선택 자료 비교 보기</button>
            <button onClick={clearSelection} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">선택 해제</button>
          </div>
        )}

        {materials.length === 0 ? (
          <div className="mt-4"><EmptyState title="저장된 분석 자료가 없습니다" description="위에 CSV를 올려 첫 분석 자료를 만들어 보세요." /></div>
        ) : filtered.length === 0 ? (
          <div className="mt-4"><EmptyState title="검색 결과 없음" description={`'${applied}' 와(과) 일치하는 분석 자료가 없습니다.`} /></div>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[1120px] text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] text-slate-500">
                  <th className="w-8 px-2 py-2"></th>
                  <th className="px-2 py-2 font-medium">
                    <button onClick={toggleNameSort} className="hover:text-slate-700">
                      이름{nameSort === "asc" ? " ↑" : nameSort === "desc" ? " ↓" : ""} / 기간 / 태그
                    </button>
                  </th>
                  <th className="px-2 py-2 font-medium">캠페인</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-medium">광고수</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-medium">광고비</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-medium">노출</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-medium">CPM</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-medium">링크클릭</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-medium">구매</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-medium">구매매출</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right font-medium">ROAS</th>
                  <th className="px-2 py-2 font-medium">판정</th>
                  <th className="px-2 py-2 font-medium">생성일</th>
                  <th className="px-2 py-2 font-medium">작업</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const a = analyses.get(m.id)!;
                  const roas = a.total.spend > 0 && a.total.purchaseValue > 0 ? (a.total.purchaseValue / a.total.spend) * 100 : null;
                  const isSel = selected.includes(m.id);
                  const camp = displayCampaign(csvCampaignsOf(m.id), m.manualCampaignName);
                  const cpmM = findMetric(metricGroupsForAgg(a.total, a.present), "cpm");
                  const cpmText = cpmM ? formatMetricValue(cpmM) : "계산 불가";
                  return (
                    <tr key={m.id} className={cn("border-b border-slate-100 align-top", isSel && "bg-brand/5")}>
                      <td className="px-2 py-2"><input type="checkbox" checked={isSel} onChange={() => toggleSelect(m.id)} /></td>
                      <td className="px-2 py-2">
                        <button onClick={() => openDetail(m.id)} className="text-left">
                          <span className="clamp-1 font-semibold text-slate-800 hover:text-brand" title={m.name}>{m.name}</span>
                        </button>
                        <div className="text-[10px] text-slate-400">{m.periodStart || "기간?"} ~ {m.periodEnd || "기간?"}</div>
                        {m.tags.length > 0 && <div className="mt-0.5 flex flex-wrap gap-1">{m.tags.map((t) => <span key={t} className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">#{t}</span>)}</div>}
                      </td>
                      <td className="max-w-[180px] px-2 py-2">
                        <span
                          className={cn("clamp-2", camp.source === "none" ? "text-slate-400" : "text-slate-600")}
                          title={camp.full.length ? camp.full.join(", ") : "캠페인명 미등록"}
                        >
                          {camp.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">{a.adCount}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">{formatKRW(a.total.spend)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">{formatNumber(a.total.impressions)}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">{cpmText}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">{a.present.includes("linkClicks") ? formatNumber(a.total.linkClicks) : "-"}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">{a.present.includes("purchases") ? formatNumber(a.total.purchases) : "-"}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">{a.present.includes("purchaseValue") ? formatKRW(a.total.purchaseValue) : "-"}</td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">{roas !== null ? formatPct(roas, 0) : "계산 불가"}</td>
                      <td className="whitespace-nowrap px-2 py-2"><VerdictBadge code={a.verdict.code} /></td>
                      <td className="whitespace-nowrap px-2 py-2 text-[10px] text-slate-400">{formatDate(m.createdAt)}</td>
                      <td className="px-2 py-2 align-middle">
                        {/* 작업 버튼은 의도적으로 2줄로 정리(가로 폭 최소화) */}
                        <div className="flex max-w-[172px] flex-wrap gap-1 text-[10px]">
                          <button onClick={() => openDetail(m.id)} className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:bg-slate-50">상세</button>
                          <button onClick={() => { const n = prompt("새 이름", m.name); if (n) rename(m.id, n); }} className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:bg-slate-50">이름</button>
                          <button onClick={() => { const c = prompt("캠페인명 (수기 입력) — CSV에 캠페인명이 있으면 그 값이 우선 표시됩니다.", m.manualCampaignName ?? ""); if (c !== null) updateMeta(m.id, { manualCampaignName: c.trim() }); }} className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:bg-slate-50">캠페인</button>
                          <button onClick={() => { const t = prompt("태그 (쉼표 구분)", m.tags.join(", ")); if (t !== null) updateMeta(m.id, { tags: t.split(",").map((x) => x.trim()).filter(Boolean) }); }} className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:bg-slate-50">태그</button>
                          <button onClick={() => { const mm = prompt("메모", m.memo); if (mm !== null) updateMeta(m.id, { memo: mm }); }} className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:bg-slate-50">메모</button>
                          <button onClick={() => exportMaterialJson(m)} className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:bg-slate-50">JSON</button>
                          <button onClick={() => exportOriginalCsv(m)} className="rounded border border-slate-200 px-1.5 py-0.5 text-slate-600 hover:bg-slate-50">원본CSV</button>
                          <button onClick={() => { if (confirm(`'${m.name}'을(를) 삭제합니다.`)) remove(m.id); }} className="rounded border border-rose-200 px-1.5 py-0.5 text-rose-600 hover:bg-rose-50">삭제</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
