"use client";

import { useEffect, useMemo, useState } from "react";
import { useMaterials } from "@/components/providers/MaterialsProvider";
import { buildMaterialAnalysis, materialDataset, synthAnalysis } from "@/lib/materials/compute";
import { analyzeAdCsv, contributionsForAd, listAdRows } from "@/lib/csv/analyze";
import { computeMaterialProfit, computeOverallProfit, elapsedDays } from "@/lib/materials/profitView";
import { integratedVerdict } from "@/lib/materials/integrate";
import { getAllAdStatus } from "@/lib/materials/store";
import { normalizeAdStatus, type AdStatus } from "@/lib/materials/adStatus";
import type { AdItem } from "@/components/materials/AdsTable";
import { AdsTable } from "@/components/materials/AdsTable";
import { AdPickerList } from "@/components/materials/AdPickerList";
import { ProfitBarChart, type ProfitBarRow } from "@/components/materials/ProfitBarChart";
import { ShareSummary } from "@/components/materials/ShareSummary";
import { AnalysisNav } from "@/components/materials/AnalysisNav";
import { useProfitRecord } from "@/components/materials/useProfitRecord";
import { BepRoasCalculator } from "@/components/materials/BepRoasCalculator";
import { VerdictBadge } from "@/components/ui/VerdictBadge";
import { EmptyState } from "@/components/ui/common";
import { AdDetail } from "@/components/dashboard/detail/AdDetail";
import { VERDICT_META } from "@/lib/verdict/engine";

const PROFIT_TONE: Record<string, string> = {
  "BEP 초과": "border-emerald-300 bg-emerald-50 text-emerald-700",
  "BEP 미달": "border-rose-300 bg-rose-50 text-rose-700",
  손익분기: "border-slate-300 bg-slate-100 text-slate-700",
};

function numOrNull(s: string): number | null {
  const t = s.trim().replace(/%$/, "");
  if (t === "") return null;
  const n = Number(t.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return n < 0 ? 0 : n;
}

// BEP ROAS 직접 입력 (자료 전체 공통). 옆의 '계산하기' 버튼으로 계산기 모달을 연다.
function BepRoasInput({ bepRoas, onChange }: { bepRoas: number | null; onChange: (v: number | null) => void }) {
  const [calcOpen, setCalcOpen] = useState(false);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-700">수익성 입력</h3>
      <p className="mt-0.5 text-[11px] text-slate-400">BEP ROAS 직접 입력</p>
      <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="whitespace-nowrap font-medium">BEP ROAS (%)</span>
        <input
          type="number"
          min={0}
          step="0.1"
          value={bepRoas ?? ""}
          onChange={(e) => onChange(numOrNull(e.target.value))}
          placeholder="예: 220"
          className="w-36 rounded-md border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-brand"
        />
        <button
          type="button"
          onClick={() => setCalcOpen(true)}
          className="whitespace-nowrap rounded-md border border-brand/40 bg-brand/5 px-2.5 py-1 font-medium text-brand hover:bg-brand/10"
        >
          BEP ROAS 계산하기
        </button>
        <span className="text-slate-400">{bepRoas != null ? `${bepRoas.toFixed(1)}% 적용 중` : "미입력"}</span>
      </label>
      <p className="mt-2 text-[10px] text-slate-400">
        BEP ROAS는 직접 입력하거나 계산기로 산출할 수 있습니다. 이 값은 이 분석 자료의 모든 광고(추정 ROAS 비교·요약·진단)에 공통 적용됩니다.
      </p>
      <BepRoasCalculator open={calcOpen} onClose={() => setCalcOpen(false)} onApply={(v) => onChange(v)} />
    </section>
  );
}

export function MaterialDetail() {
  const { materials, detailId, settings, backToLibrary } = useMaterials();
  const material = materials.find((m) => m.id === detailId);
  const [adKey, setAdKey] = useState<string | null>(null);
  const { record, setBepRoas, saveError: bepSaveError } = useProfitRecord(material?.id ?? "");

  // 좌측 '광고 탐색' 리스트용 운영 상태(Supabase). 탐색 필터/정렬은 AdPickerList 내부에서 관리한다.
  const [statusMap, setStatusMap] = useState<Record<string, AdStatus>>({});
  useEffect(() => {
    let cancelled = false;
    getAllAdStatus()
      .then((raw) => {
        if (cancelled) return;
        const m: Record<string, AdStatus> = {};
        for (const [k, v] of Object.entries(raw)) m[k] = normalizeAdStatus(v);
        setStatusMap(m);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const analysis = useMemo(() => (material ? buildMaterialAnalysis(material, settings) : null), [material, settings]);
  const dataset = useMemo(() => (material ? materialDataset(material) : null), [material]);
  const overall = useMemo(() => (analysis ? synthAnalysis(analysis.name, analysis.total, analysis.present, settings) : null), [analysis, settings]);

  const items = useMemo<AdItem[]>(() => {
    if (!dataset || !analysis) return [];
    return analysis.ads
      .map((ad) => {
        const an = analyzeAdCsv(dataset, ad.key, settings);
        return an ? { ad, an } : null;
      })
      .filter((x): x is AdItem => x !== null);
  }, [dataset, analysis, settings]);

  const bepRoas = record?.bepRoas ?? null;
  // 공통 수익성 계산 (그래프·요약·진단·상세가 이 결과 재사용)
  const profit = useMemo(
    () => (analysis ? computeMaterialProfit(analysis.ads, analysis.present, record) : null),
    [analysis, record],
  );
  const overallProfit = useMemo(
    () => (analysis ? computeOverallProfit(analysis.total, analysis.present, record) : null),
    [analysis, record],
  );

  if (!material || !analysis || !dataset || !overall || !profit || !overallProfit) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <EmptyState title="자료를 찾을 수 없습니다" />
        <button onClick={backToLibrary} className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">목록으로</button>
      </div>
    );
  }

  const vm = VERDICT_META[analysis.verdict.code];
  const periodLabel = `${material.periodStart || "기간?"} ~ ${material.periodEnd || "기간?"}`;
  const startDate = material.periodStart ?? null;
  const days = elapsedDays(material.periodStart, material.periodEnd);

  const selected = adKey ? items.find((x) => x.ad.key === adKey) : null;

  // 좌측 '광고 비교' 리스트 표시용 파생값 — 1차 판정은 통합 비교와 동일한 BEP 기준(integratedVerdict) 재사용.
  // (각 광고의 상세 성과 판정은 우측 상세/자료 상단에 그대로 표시된다. 계산·판정 로직은 변경하지 않는다.)
  const verdictFor = (k: string) => integratedVerdict(profit.byKey.get(k)?.estimatedRoas ?? null, bepRoas);
  const roasFor = (k: string) => profit.byKey.get(k)?.estimatedRoas ?? null;
  const statusFor = (k: string): AdStatus => statusMap[k] ?? "active";

  const barRows: ProfitBarRow[] = items.map(({ ad, an }) => {
    const pv = profit.byKey.get(ad.key);
    const tags: string[] = [];
    if (an.verdict.code === "data_insufficient") tags.push("데이터 부족");
    else if (an.verdict.code === "monitor") tags.push("추가 관찰");
    return {
      key: ad.key,
      name: ad.adName,
      estimatedRoas: pv?.estimatedRoas ?? null,
      bepRoas: pv?.bepRoas ?? null,
      diffPp: pv?.diffPp ?? null,
      verdict: pv?.verdict ?? "추정 ROAS 계산 불가",
      tags,
    };
  });

  const Header = (
    <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200 bg-white px-5 py-2.5">
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <AnalysisNav onHome={backToLibrary} onBack={() => (adKey ? setAdKey(null) : backToLibrary())} />
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-slate-800" title={adKey && selected ? selected.ad.adName : material.name}>{adKey && selected ? selected.ad.adName : material.name}</h1>
          <p className="truncate text-[11px] text-slate-400">{adKey && selected ? material.name : `${periodLabel} · 광고 ${analysis.adCount}개 · ${material.file.name}`}</p>
        </div>
      </div>
    </header>
  );

  // ── 광고 선택 시: master-detail (좌: 광고 비교 / 우: 상세, 계산 입력 없음) ──
  if (adKey && selected) {
    return (
      <div className="flex h-screen flex-col bg-slate-50">
        {Header}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="scroll-thin max-h-56 shrink-0 overflow-y-auto border-b border-slate-200 bg-white p-3 lg:max-h-none lg:w-[300px] lg:border-b-0 lg:border-r">
            <h2 className="mb-2 text-sm font-bold text-slate-700">광고 탐색</h2>
            <AdPickerList items={items} selectedKey={adKey} onSelect={setAdKey} statusFor={statusFor} verdictFor={verdictFor} roasFor={roasFor} />
          </div>
          <div className="scroll-thin min-w-0 flex-1 overflow-y-auto p-4">
            <div className="mx-auto max-w-6xl space-y-3">
              <AdDetail
                analysis={selected.an}
                contributions={contributionsForAd(dataset, adKey)}
                setAds={listAdRows(dataset, selected.an.record.adSetKey, settings)}
                campaignName={selected.an.record.campaignName}
                adSetName={selected.an.record.adSetName}
                settings={settings}
                viewMode="detail"
                rangeLabel={periodLabel}
                prevRangeLabel="비교 데이터 없음"
                hideSetComparison
                profit={profit.byKey.get(adKey) ?? null}
                startDate={startDate}
                elapsedDays={days}
                present={analysis.present}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 자료 전체(광고 미선택) ── 소재별 수익성 비교는 맨 아래 ──
  return (
    <div className="min-h-screen bg-slate-50">
      {Header}
      <main className="mx-auto max-w-5xl space-y-3 px-5 py-4">
        {material.memo && <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">메모: {material.memo}</div>}
        {analysis.warnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">{analysis.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}</div>
        )}

        <section className="rounded-xl border-2 border-slate-200 bg-white p-4">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5"><span className="text-[10px] text-slate-400">성과 판정</span><VerdictBadge code={analysis.verdict.code} size="md" /></span>
            <span className="flex items-center gap-1.5"><span className="text-[10px] text-slate-400">수익성 판정</span>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${PROFIT_TONE[overallProfit.verdict] ?? "border-slate-300 bg-slate-100 text-slate-500"}`}>{overallProfit.verdict}</span>
            </span>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">데이터 {analysis.verdict.dataSufficiency}</span>
          </div>
          <p className="text-sm font-semibold text-slate-800">{vm.label} — {analysis.verdict.action}</p>
          <ul className="mt-2 space-y-1">{analysis.verdict.reasons.map((r, i) => <li key={i} className="flex gap-1.5 text-xs text-slate-600"><span className="text-brand">·</span>{r}</li>)}</ul>
        </section>

        <BepRoasInput bepRoas={bepRoas} onChange={setBepRoas} />
        {bepSaveError && <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{bepSaveError}</div>}

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-bold text-slate-700">포함 광고 ({analysis.adCount})</h3>
          <AdsTable items={items} onSelect={setAdKey} showCampaign sortable />
          <p className="mt-1.5 text-[10px] text-slate-400">광고를 클릭하면 상세 지표·진단·기여도·수익성 분석을 볼 수 있습니다.</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-3 text-sm font-bold text-slate-700">공유용 요약</h3>
          <ShareSummary title={material.name} perf={overall} profit={overallProfit} startDate={startDate} elapsedDays={days} present={analysis.present} />
        </section>

        {/* 소재별 수익성 비교 — 페이지 맨 아래 */}
        <ProfitBarChart rows={barRows} />
      </main>
    </div>
  );
}
