"use client";

// 기간 A vs 기간 B 성과 비교 화면. 계산은 periodCompare(순수) + 기존 통합/계산 엔진 재사용.
// 기존 통합 분석/판정/CSV/Supabase 로직은 변경하지 않는다.

import { useEffect, useMemo, useState } from "react";
import { useMaterials } from "@/components/providers/MaterialsProvider";
import { AnalysisNav } from "@/components/materials/AnalysisNav";
import { buildMaterialAnalysis } from "@/lib/materials/compute";
import { getAllAdStatus } from "@/lib/materials/store";
import { AD_STATUS_LABEL, AD_STATUS_OPTIONS, normalizeAdStatus, type AdStatus } from "@/lib/materials/adStatus";
import {
  computeGroup, comparePeriods, groupDataDays, dailyActiveCreatives,
  relPct, COMPARE_STATUS_LABEL,
  type AdMetrics, type CompareRow, type CompareStatus, type GroupSummary, type SameAdRow,
} from "@/lib/materials/periodCompare";
import { formatKRW, formatNumber, formatPct, formatRatio } from "@/lib/metrics/format";
import { naturalCompare } from "@/lib/natural";
import { creativeLabel, EmptyState } from "@/components/ui/common";
import { BepRoasCalculator } from "@/components/materials/BepRoasCalculator";
import { cn } from "@/lib/cn";

// ── 값/증감 포맷 ─────────────────────────────────────────────
function fmtVal(unit: CompareRow["unit"], v: number | null): string {
  if (v == null) return "계산 불가";
  if (unit === "krw") return formatKRW(v);
  if (unit === "pct") return formatPct(v, 1);
  if (unit === "ratio") return formatRatio(v);
  return Number.isInteger(v) ? formatNumber(v) : formatNumber(v, 1);
}
const HIGHER_BETTER = new Set(["ctr", "cvr", "roas", "landingRate", "purchase", "revenue"]);
const LOWER_BETTER = new Set(["cpm", "cpc", "cpa"]);
function toneOf(key: string, delta: number): "up" | "down" | "flat" {
  if (delta === 0) return "flat";
  const good = HIGHER_BETTER.has(key) ? delta > 0 : LOWER_BETTER.has(key) ? delta < 0 : null;
  if (good == null) return "flat";
  return good ? "up" : "down";
}
const TONE_CLASS: Record<string, string> = { up: "text-emerald-600", down: "text-rose-600", flat: "text-slate-400" };

function changeOf(key: string, kind: CompareRow["changeKind"], a: number | null, b: number | null): { text: string; tone: string } {
  if (kind === "none" || a == null || b == null) return { text: "-", tone: "text-slate-400" };
  if (kind === "pp") {
    const d = b - a;
    return { text: `${d >= 0 ? "+" : ""}${d.toFixed(1)}%p`, tone: TONE_CLASS[toneOf(key, d)] };
  }
  const rel = relPct(a, b);
  if (rel == null) return { text: "-", tone: "text-slate-400" };
  return { text: `${rel >= 0 ? "+" : ""}${rel.toFixed(1)}%`, tone: TONE_CLASS[toneOf(key, rel)] };
}

const STATUS_TONE: Record<CompareStatus, string> = {
  improved: "border-emerald-300 bg-emerald-50 text-emerald-700",
  worsened: "border-rose-300 bg-rose-50 text-rose-700",
  limited: "border-slate-300 bg-slate-100 text-slate-600",
  insufficient: "border-amber-300 bg-amber-50 text-amber-700",
};

function fmtDot(iso?: string | null): string {
  return iso ? iso.replace(/-/g, ".").slice(5) : "-";
}

export function PeriodCompareView() {
  const { materials, settings, selected, backToLibrary, clearSelection } = useMaterials();
  const byId = useMemo(() => new Map(materials.map((m) => [m.id, m])), [materials]);
  const selMats = useMemo(() => selected.map((id) => byId.get(id)).filter(Boolean) as typeof materials, [selected, byId]);

  // 기간 A/B 그룹 배정 (기본: 기간 이른 절반=A, 늦은 절반=B)
  const [groupOf, setGroupOf] = useState<Record<string, "A" | "B">>({});
  useEffect(() => {
    setGroupOf((prev) => {
      const next = { ...prev };
      const missing = selMats.filter((m) => !next[m.id]);
      if (missing.length === 0) return prev;
      const sorted = [...selMats].sort((a, b) => (a.periodStart ?? "").localeCompare(b.periodStart ?? ""));
      const half = Math.ceil(sorted.length / 2);
      sorted.forEach((m, i) => { if (!next[m.id]) next[m.id] = i < half ? "A" : "B"; });
      return next;
    });
  }, [selMats]);

  const [nameA, setNameA] = useState("변경 전");
  const [nameB, setNameB] = useState("변경 후");
  const [bepRoas, setBepRoas] = useState<number | null>(null);
  const [bepCalcOpen, setBepCalcOpen] = useState(false);
  const [statusMap, setStatusMap] = useState<Record<string, AdStatus>>({});
  const [statusFilter, setStatusFilter] = useState<"all" | CompareStatus>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "image" | "video">("all");
  const [opFilter, setOpFilter] = useState<"all" | AdStatus>("all");
  const [sortKey, setSortKey] = useState<string>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAllAdStatus().then((raw) => {
      if (cancelled) return;
      const m: Record<string, AdStatus> = {};
      for (const [k, v] of Object.entries(raw)) m[k] = normalizeAdStatus(v);
      setStatusMap(m);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const aMats = useMemo(() => selMats.filter((m) => groupOf[m.id] === "A"), [selMats, groupOf]);
  const bMats = useMemo(() => selMats.filter((m) => groupOf[m.id] === "B"), [selMats, groupOf]);

  const result = useMemo(() => {
    if (aMats.length === 0 || bMats.length === 0) return null;
    const aAn = aMats.map((m) => buildMaterialAnalysis(m, settings));
    const bAn = bMats.map((m) => buildMaterialAnalysis(m, settings));
    const daysA = groupDataDays(aMats);
    const daysB = groupDataDays(bMats);
    const A = computeGroup(nameA, aAn, daysA, settings, dailyActiveCreatives(aMats, daysA));
    const B = computeGroup(nameB, bAn, daysB, settings, dailyActiveCreatives(bMats, daysB));
    return comparePeriods(A, B);
  }, [aMats, bMats, settings, nameA, nameB]);

  const setGroup = (id: string, g: "A" | "B") => setGroupOf((prev) => ({ ...prev, [id]: g }));

  const Header = (
    <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200 bg-white px-5 py-2.5">
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <AnalysisNav onHome={() => { clearSelection(); backToLibrary(); }} onBack={backToLibrary} />
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-slate-800">기간 비교 (A/B)</h1>
          <p className="truncate text-[11px] text-slate-400">선택 자료 {selMats.length}개 · 기간 A {aMats.length} · 기간 B {bMats.length}</p>
        </div>
      </div>
    </header>
  );

  if (selMats.length < 2) {
    return (
      <div className="min-h-screen bg-slate-50">{Header}
        <div className="p-6"><EmptyState title="기간 비교는 2개 이상 선택해야 합니다" /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {Header}
      <main className="mx-auto max-w-6xl space-y-4 px-5 py-4">
        {/* 그룹 배정 */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {(["A", "B"] as const).map((g) => (
            <div key={g} className={cn("rounded-xl border-2 bg-white p-3", g === "A" ? "border-sky-200" : "border-violet-200")}>
              <div className="mb-2 flex items-center gap-2">
                <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold text-white", g === "A" ? "bg-sky-500" : "bg-violet-500")}>기간 {g}</span>
                <input
                  value={g === "A" ? nameA : nameB}
                  onChange={(e) => (g === "A" ? setNameA(e.target.value) : setNameB(e.target.value))}
                  className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-sm font-semibold text-slate-700 outline-none focus:border-brand"
                />
              </div>
              <div className="space-y-1">
                {selMats.map((m) => (
                  <div key={m.id} className={cn("flex items-center gap-2 rounded-md border px-2 py-1", groupOf[m.id] === g ? "border-slate-200 bg-slate-50" : "border-transparent opacity-40")}>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-slate-600" title={m.name}>{m.name}</span>
                    <span className="shrink-0 text-[10px] text-slate-400">{fmtDot(m.periodStart)}~{fmtDot(m.periodEnd)}</span>
                    <div className="flex shrink-0 gap-0.5">
                      <button onClick={() => setGroup(m.id, "A")} className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", groupOf[m.id] === "A" ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-500")}>A</button>
                      <button onClick={() => setGroup(m.id, "B")} className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", groupOf[m.id] === "B" ? "bg-violet-500 text-white" : "bg-slate-100 text-slate-500")}>B</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* BEP 입력 */}
        <section className="rounded-xl border border-slate-200 bg-white p-3">
          <label className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <span className="font-medium">BEP ROAS (%)</span>
            <input type="number" min={0} step="0.1" value={bepRoas ?? ""} onChange={(e) => { const t = e.target.value.trim(); setBepRoas(t === "" ? null : Math.max(0, Number(t))); }} placeholder="예: 200" className="w-32 rounded-md border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-brand" />
            <button
              type="button"
              onClick={() => setBepCalcOpen(true)}
              className="whitespace-nowrap rounded-md border border-brand/40 bg-brand/5 px-2.5 py-1 font-medium text-brand hover:bg-brand/10"
            >
              BEP ROAS 계산하기
            </button>
            <span className="text-slate-400">{bepRoas != null ? `${bepRoas.toFixed(1)}% 적용 (수익성 기준)` : "미입력 → 수익성 기준 비교 불가"}</span>
          </label>
          <BepRoasCalculator open={bepCalcOpen} onClose={() => setBepCalcOpen(false)} onApply={(v) => setBepRoas(v)} />
        </section>

        {!result ? (
          <EmptyState title="각 기간에 자료를 1개 이상 배정하세요" description="위에서 각 자료를 A/B로 나누면 비교 결과가 표시됩니다." />
        ) : (
          <Results result={result} bepRoas={bepRoas} statusMap={statusMap}
            statusFilter={statusFilter} setStatusFilter={setStatusFilter}
            typeFilter={typeFilter} setTypeFilter={setTypeFilter}
            opFilter={opFilter} setOpFilter={setOpFilter}
            sortKey={sortKey} sortDir={sortDir} setSort={(k) => { if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setSortDir(1); } }}
            copied={copied} setCopied={setCopied} />
        )}
      </main>
    </div>
  );
}

// ── 결과 4개 영역 ────────────────────────────────────────────
function Results({ result, bepRoas, statusMap, statusFilter, setStatusFilter, typeFilter, setTypeFilter, opFilter, setOpFilter, sortKey, sortDir, setSort, copied, setCopied }: {
  result: ReturnType<typeof comparePeriods>;
  bepRoas: number | null;
  statusMap: Record<string, AdStatus>;
  statusFilter: "all" | CompareStatus; setStatusFilter: (v: "all" | CompareStatus) => void;
  typeFilter: "all" | "image" | "video"; setTypeFilter: (v: "all" | "image" | "video") => void;
  opFilter: "all" | AdStatus; setOpFilter: (v: "all" | AdStatus) => void;
  sortKey: string; sortDir: 1 | -1; setSort: (k: string) => void;
  copied: boolean; setCopied: (v: boolean) => void;
}) {
  const { A, B, rows, sameAds, excluded, newAds, excludedSummary, newSummary, summary } = result;

  // 운영 상태 = 저장된 Supabase 값(mergeKey 기준). 미저장은 '집행 중'(active) 기본 — 광고 비교 화면과 동일 규칙.
  const opOf = (r: SameAdRow): AdStatus => statusMap[r.mergeKey] ?? "active";
  const statusCount = (s: CompareStatus) => sameAds.filter((r) => r.status === s).length;
  const opCount = (s: AdStatus) => sameAds.filter((r) => opOf(r) === s).length;
  const filtered = useMemo(() => {
    let list = sameAds;
    if (statusFilter !== "all") list = list.filter((r) => r.status === statusFilter);
    if (typeFilter !== "all") list = list.filter((r) => r.creativeType === typeFilter);
    if (opFilter !== "all") list = list.filter((r) => (statusMap[r.mergeKey] ?? "active") === opFilter);
    const val = (r: SameAdRow): number | string => {
      switch (sortKey) {
        case "roasA": return r.a.roas ?? -1;
        case "roasB": return r.b.roas ?? -1;
        case "roasChange": return (r.b.roas ?? 0) - (r.a.roas ?? 0);
        case "cpaA": return r.a.cpa ?? Number.MAX_SAFE_INTEGER;
        case "cpaB": return r.b.cpa ?? Number.MAX_SAFE_INTEGER;
        case "spendChange": return relPct(r.a.dayAvgSpend, r.b.dayAvgSpend) ?? 0;
        case "purchaseChange": return relPct(r.a.dayAvgPurchase, r.b.dayAvgPurchase) ?? 0;
        default: return r.adName;
      }
    };
    return [...list].sort((x, y) => {
      const vx = val(x), vy = val(y);
      if (typeof vx === "string" || typeof vy === "string") return naturalCompare(String(vx), String(vy)) * sortDir;
      return (vx - vy) * sortDir;
    });
  }, [sameAds, statusFilter, typeFilter, opFilter, statusMap, sortKey, sortDir]);

  const copyText = () => {
    const line = (key: string) => {
      const r = rows.find((x) => x.key === key)!;
      const c = changeOf(r.key, r.changeKind, r.a, r.b);
      return `${r.label}: ${fmtVal(r.unit, r.a)} → ${fmtVal(r.unit, r.b)} (${c.text})`;
    };
    const text = [
      `${A.name}(${fmtDot(A.periodStart)}~${fmtDot(A.periodEnd)}, 데이터 ${A.dataDays}일) 대비 ${B.name}(${fmtDot(B.periodStart)}~${fmtDot(B.periodEnd)}, 데이터 ${B.dataDays}일) 성과 비교`,
      `- ${line("spend")}`,
      `- ${line("purchase")}`,
      `- ${line("cpa")}`,
      `- ${line("roas")}`,
      `- 동일 소재 ${sameAds.length}개 / 변경 후 제외 ${excluded.length}개 / 신규 ${newAds.length}개`,
      `- ${summary.sentence}`,
    ].join("\n");
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => window.prompt("복사", text));
  };

  return (
    <>
      {/* 공유용 요약 (캡처용, 최상단) */}
      <section className="rounded-xl border-2 border-slate-200 bg-white p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">기간 비교 · 공유용 요약</h2>
          <button onClick={copyText} className="rounded-md bg-brand px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700">{copied ? "복사됨 ✓" : "보고 문구 복사"}</button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SumCell label={A.name} value={`${fmtDot(A.periodStart)}~${fmtDot(A.periodEnd)}`} sub={`데이터 ${A.dataDays}일`} tone="sky" />
          <SumCell label={B.name} value={`${fmtDot(B.periodStart)}~${fmtDot(B.periodEnd)}`} sub={`데이터 ${B.dataDays}일`} tone="violet" />
          <SumCell label="동일 소재" value={`${sameAds.length}개`} sub={`제외 ${excluded.length} · 신규 ${newAds.length}`} />
          <SumCell label="수익성 기준" value={bepRoas != null ? `BEP ${formatPct(bepRoas)}` : "BEP 미입력"} sub={bepRoas != null ? "" : "수익성 비교 불가"} />
        </div>
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600">{summary.sentence}</p>
      </section>

      {/* ① 전체 운영 성과 비교 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-2 text-sm font-bold text-slate-700">① 전체 운영 성과 비교 <span className="text-[10px] font-normal text-slate-400">· raw volume은 일평균, 비율은 통합 재계산값</span></h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] text-slate-400">
                <th className="py-1.5 text-left font-medium">지표</th>
                <th className="py-1.5 text-right font-medium">{A.name}</th>
                <th className="py-1.5 text-right font-medium">{B.name}</th>
                <th className="py-1.5 text-right font-medium">변화</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const c = changeOf(r.key, r.changeKind, r.a, r.b);
                const showTotals = r.aTotal != null || r.bTotal != null;
                return (
                  <tr key={r.key} className="border-b border-slate-100">
                    <td className="py-1.5 text-slate-600">{r.label}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-800">
                      {fmtVal(r.unit, r.a)}
                      {showTotals && <span className="block text-[10px] text-slate-400">총 {r.aTotal != null ? fmtVal(r.unit, r.aTotal) : "-"}</span>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-slate-800">
                      {fmtVal(r.unit, r.b)}
                      {showTotals && <span className="block text-[10px] text-slate-400">총 {r.bTotal != null ? fmtVal(r.unit, r.bTotal) : "-"}</span>}
                    </td>
                    <td className={cn("py-1.5 text-right font-semibold tabular-nums", c.tone)}>{c.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ② 동일 소재 Before/After */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-700">② 동일 소재 Before / After <span className="text-[10px] font-normal text-slate-400">· {sameAds.length}개 · 데이터 {A.dataDays}일 → {B.dataDays}일 (총 구매·표본은 규모 확인용)</span></h3>
        </div>
        {/* 필터 */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          {(["all", "improved", "worsened", "limited", "insufficient"] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)} className={cn("rounded-full border px-2 py-0.5 font-medium", statusFilter === s ? "border-brand bg-brand text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50")}>
              {s === "all" ? "전체" : COMPARE_STATUS_LABEL[s]} {s === "all" ? sameAds.length : statusCount(s)}
            </button>
          ))}
          <span className="mx-1 text-slate-300">|</span>
          {(["all", "image", "video"] as const).map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)} className={cn("rounded-full border px-2 py-0.5 font-medium", typeFilter === t ? "border-brand bg-brand text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50")}>
              {t === "all" ? "전체 유형" : t === "image" ? "이미지" : "영상"}
            </button>
          ))}
        </div>
        {/* 운영 상태 필터 (저장된 Supabase 값 그대로) */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="mr-0.5 font-medium text-slate-400">운영 상태</span>
          {(["all", ...AD_STATUS_OPTIONS] as const).map((s) => (
            <button key={s} onClick={() => setOpFilter(s)} className={cn("rounded-full border px-2 py-0.5 font-medium", opFilter === s ? "border-brand bg-brand text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50")}>
              {s === "all" ? "전체" : AD_STATUS_LABEL[s]} {s === "all" ? sameAds.length : opCount(s)}
            </button>
          ))}
        </div>
        {sameAds.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-slate-400">두 기간에 공통으로 존재하는 광고가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] text-slate-400">
                  <SortTh label="광고" k="name" cur={sortKey} dir={sortDir} onSort={setSort} align="left" />
                  <th className="py-1.5 text-left font-medium">유형</th>
                  <SortTh label="일평균 광고비" k="spendChange" cur={sortKey} dir={sortDir} onSort={setSort} />
                  <SortTh label="일평균 구매" k="purchaseChange" cur={sortKey} dir={sortDir} onSort={setSort} />
                  <th className="py-1.5 text-right font-medium">CTR</th>
                  <th className="py-1.5 text-right font-medium">CPC</th>
                  <th className="py-1.5 text-right font-medium">CVR</th>
                  <SortTh label="CPA" k="cpaB" cur={sortKey} dir={sortDir} onSort={setSort} />
                  <SortTh label="ROAS" k="roasChange" cur={sortKey} dir={sortDir} onSort={setSort} />
                  <th className="py-1.5 text-right font-medium">상태</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.mergeKey} className="border-b border-slate-100 align-top">
                    <td className="py-1.5 pr-2">
                      <span className="block max-w-[150px] truncate font-medium text-slate-700" title={r.adName}>{r.adName}</span>
                      {statusMap[r.mergeKey] && statusMap[r.mergeKey] !== "active" && (
                        <span className="text-[10px] text-slate-400">{AD_STATUS_LABEL[statusMap[r.mergeKey]]}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-[11px] text-slate-500">{creativeLabel(r.creativeType)}</td>
                    <BAcell k="spend" unit="krw" a={r.a.dayAvgSpend} b={r.b.dayAvgSpend} kind="pct" />
                    <PurchaseCell a={r.a} b={r.b} weak={r.sampleWeak} />
                    <BAcell k="ctr" unit="pct" a={r.a.ctr} b={r.b.ctr} kind="pp" />
                    <BAcell k="cpc" unit="krw" a={r.a.cpc} b={r.b.cpc} kind="pct" />
                    <CvrCell a={r.a} b={r.b} weak={r.sampleWeak} />
                    <BAcell k="cpa" unit="krw" a={r.a.cpa} b={r.b.cpa} kind="pct" />
                    <BAcell k="roas" unit="pct" a={r.a.roas} b={r.b.roas} kind="pp" bep={bepRoas} />
                    <td className="py-1.5 text-right">
                      <span className={cn("inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold", STATUS_TONE[r.status])}>{COMPARE_STATUS_LABEL[r.status]}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ③ 소재 구성 변화 */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <CompGroup title="변경 후 제외된 소재" note="A에만 존재 (자동 OFF 확정 아님)" summary={excludedSummary} ads={excluded.map((m) => ({ key: m.mergeKey, name: m.adName, status: statusMap[m.mergeKey] }))} tone="rose" bepRoas={bepRoas} />
        <CompGroup title="신규 등장 소재" note="B에만 존재 · 데이터 짧으면 초기 성과" summary={newSummary} ads={newAds.map((m) => ({ key: m.mergeKey, name: m.adName, status: statusMap[m.mergeKey] }))} tone="emerald" bepRoas={bepRoas} />
      </section>

      {/* ④ 성과 변화 요약 */}
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <h3 className="mb-1 text-sm font-bold text-slate-700">④ 성과 변화 요약 <span className="text-[10px] font-normal text-slate-400">· 원인 단정 아님, 가능성 해석</span></h3>
        <p className="text-sm leading-relaxed text-slate-700">{summary.sentence}</p>
        {summary.bDataShort && <p className="mt-1 text-[11px] text-amber-600">변경 후 데이터가 3일 미만이라 초기 변화로만 확인해주세요.</p>}
      </section>
    </>
  );
}

function SumCell({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "sky" | "violet" }) {
  return (
    <div className={cn("rounded-lg border p-2", tone === "sky" ? "border-sky-200 bg-sky-50" : tone === "violet" ? "border-violet-200 bg-violet-50" : "border-slate-200 bg-slate-50")}>
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className="truncate text-sm font-bold text-slate-800" title={value}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}

function SortTh({ label, k, cur, dir, onSort, align = "right" }: { label: string; k: string; cur: string; dir: 1 | -1; onSort: (k: string) => void; align?: "left" | "right" }) {
  return (
    <th className={cn("py-1.5 font-medium", align === "left" ? "text-left" : "text-right")}>
      <button onClick={() => onSort(k)} className="inline-flex items-center gap-0.5 hover:text-slate-700">
        {label}{cur === k && <span>{dir === 1 ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
}

// Before/After 셀 (a → b + 증감)
function BAcell({ k, unit, a, b, kind, bep }: { k: string; unit: CompareRow["unit"]; a: number | null; b: number | null; kind: CompareRow["changeKind"]; bep?: number | null }) {
  const c = changeOf(k, kind, a, b);
  const bepTone = k === "roas" && bep != null && b != null ? (b >= bep ? "text-emerald-600" : "text-rose-600") : "";
  return (
    <td className="py-1.5 pl-2 text-right tabular-nums">
      <span className="block whitespace-nowrap text-slate-700">
        <span className="text-slate-400">{fmtVal(unit, a)}</span>
        <span className="mx-0.5 text-slate-300">→</span>
        <span className={cn("font-medium", bepTone || "text-slate-800")}>{fmtVal(unit, b)}</span>
      </span>
      <span className={cn("block text-[10px]", c.tone)}>{c.text}</span>
    </td>
  );
}

// 정수면 그대로, 아니면 소수 1자리
function fmtCount(v: number): string {
  return Number.isInteger(v) ? formatNumber(v) : formatNumber(v, 1);
}

// 일평균 구매 셀 — 절대 변화량(건/일) + 상대 증감률 + 총 구매(표본 규모)
function PurchaseCell({ a, b, weak }: { a: AdMetrics; b: AdMetrics; weak: boolean }) {
  const av = a.dayAvgPurchase;
  const bv = b.dayAvgPurchase;
  if (av == null || bv == null) {
    return (
      <td className="py-1.5 pl-2 text-right tabular-nums">
        <span className="block text-slate-400">계산 불가</span>
        <span className="block text-[10px] text-slate-400">구매 데이터 없음</span>
      </td>
    );
  }
  const delta = bv - av; // 건/일 절대 변화
  const rel = relPct(av, bv);
  const tone = TONE_CLASS[toneOf("purchase", delta)];
  const deltaTxt = `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}건/일`;
  const relTxt = rel == null ? "" : ` · ${rel >= 0 ? "+" : ""}${rel.toFixed(1)}%`;
  const totalTxt = a.purchaseTotal != null && b.purchaseTotal != null
    ? `총 ${formatNumber(a.purchaseTotal)} → ${formatNumber(b.purchaseTotal)}건`
    : "";
  return (
    <td className="py-1.5 pl-2 text-right tabular-nums">
      <span className="block whitespace-nowrap">
        <span className="text-slate-400">{fmtCount(av)}건</span>
        <span className="mx-0.5 text-slate-300">→</span>
        <span className="font-medium text-slate-800">{fmtCount(bv)}건</span>
      </span>
      <span className={cn("block text-[10px]", tone)}>{deltaTxt}{relTxt}</span>
      {totalTxt && <span className="block text-[10px] text-slate-400">{totalTxt}</span>}
      {weak && <span className="block text-[10px] text-amber-600">구매 표본 부족 · 참고용</span>}
    </td>
  );
}

// CVR 셀 — %p 변화 + 실제 구매/LPV 분자·분모(기존 CVR 엔진과 동일 값)
function CvrCell({ a, b, weak }: { a: AdMetrics; b: AdMetrics; weak: boolean }) {
  const c = changeOf("cvr", "pp", a.cvr, b.cvr);
  const sampleTxt = (m: AdMetrics): string | null =>
    m.purchaseTotal != null && m.lpvTotal != null ? `구매 ${formatNumber(m.purchaseTotal)} / LPV ${formatNumber(m.lpvTotal)}` : null;
  const sa = sampleTxt(a);
  const sb = sampleTxt(b);
  return (
    <td className="py-1.5 pl-2 text-right tabular-nums">
      <span className="block whitespace-nowrap">
        <span className="text-slate-400">{a.cvr == null ? "계산 불가" : formatPct(a.cvr)}</span>
        <span className="mx-0.5 text-slate-300">→</span>
        <span className="font-medium text-slate-800">{b.cvr == null ? "계산 불가" : formatPct(b.cvr)}</span>
      </span>
      <span className={cn("block text-[10px]", c.tone)}>{c.text}</span>
      {sa && sb && <span className="block text-[10px] text-slate-400">{sa} → {sb}</span>}
      {weak && <span className="block text-[10px] text-amber-600">구매 표본 부족 · 참고용</span>}
    </td>
  );
}

function CompGroup({ title, note, summary, ads, tone, bepRoas }: {
  title: string; note: string; summary: GroupSummary;
  ads: { key: string; name: string; status?: AdStatus }[];
  tone: "rose" | "emerald"; bepRoas: number | null;
}) {
  const profit = summary.roas == null || bepRoas == null ? "수익성 비교 불가" : summary.roas >= bepRoas ? "BEP 초과" : "BEP 미달";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-700">{title} <span className="text-[10px] font-normal text-slate-400">· {summary.count}개</span></h3>
      <p className="mb-2 text-[10px] text-slate-400">{note}</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs sm:grid-cols-3">
        <KV label="소재 수" value={`${summary.count}개`} />
        <KV label="광고비 비중" value={summary.spendSharePct != null ? formatPct(summary.spendSharePct) : "-"} />
        <KV label="일평균 광고비" value={summary.dayAvgSpend != null ? formatKRW(summary.dayAvgSpend) : "계산 불가"} />
        <KV label="구매" value={summary.purchaseTotal != null ? formatNumber(summary.purchaseTotal) : "계산 불가"} />
        <KV label="CTR" value={summary.ctr != null ? formatPct(summary.ctr) : "계산 불가"} />
        <KV label="CPA" value={summary.cpa != null ? formatKRW(summary.cpa) : "계산 불가"} />
        <KV label="통합 ROAS" value={summary.roas != null ? formatPct(summary.roas) : "계산 불가"} />
        <KV label="수익성" value={profit} tone={tone} />
      </div>
      {ads.length > 0 && (
        <div className="mt-2 max-h-28 overflow-y-auto border-t border-slate-100 pt-2">
          {ads.map((a) => (
            <div key={a.key} className="flex items-center justify-between gap-2 py-0.5 text-[11px]">
              <span className="min-w-0 truncate text-slate-600" title={a.name}>{a.name}</span>
              {a.status && a.status !== "active"
                ? <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{title.includes("제외") ? "변경 후 제외 · " : ""}{AD_STATUS_LABEL[a.status]}</span>
                : title.includes("제외") ? <span className="shrink-0 text-[10px] text-slate-400">변경 후 제외</span> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function KV({ label, value, tone }: { label: string; value: string; tone?: "rose" | "emerald" }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={cn("font-semibold", tone === "rose" ? "text-rose-600" : tone === "emerald" ? "text-emerald-600" : "text-slate-800")}>{value}</p>
    </div>
  );
}
