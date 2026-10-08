"use client";

import { useEffect, useMemo, useState } from "react";
import { useMaterials } from "@/components/providers/MaterialsProvider";
import { getAllAdStatus, putAdStatus } from "@/lib/materials/store";
import { AD_STATUS_LABEL, AD_STATUS_OPTIONS, normalizeAdStatus, type AdStatus } from "@/lib/materials/adStatus";
import { buildMaterialAnalysis, synthAnalysis, metricGroupsForAgg } from "@/lib/materials/compute";
import { integrate, integratedVerdict, type DedupMode, type MergedAd } from "@/lib/materials/integrate";
import { metaRoasOf, type AdProfitView } from "@/lib/materials/profitView";
import { profitVerdictOf } from "@/lib/materials/profitCopy";
import { analyzeStages } from "@/lib/materials/stageAnalysis";
import { findMetric } from "@/lib/metrics/calc";
import type { VerdictCode } from "@/lib/types";
import type { AdItem } from "@/components/materials/AdsTable";
import { AdsTable } from "@/components/materials/AdsTable";
import { AdPickerList } from "@/components/materials/AdPickerList";
import { type VerdictFilter } from "@/lib/materials/adListView";
import { mergedCampaignDisplay } from "@/lib/materials/campaign";
import { AnalysisNav } from "@/components/materials/AnalysisNav";
import { IntegratedKpiHeader } from "@/components/materials/IntegratedKpiHeader";
import { BepRoasCalculator } from "@/components/materials/BepRoasCalculator";
import { IntegratedStageAnalysis } from "@/components/materials/IntegratedStageAnalysis";
import { ShareSummary } from "@/components/materials/ShareSummary";
import { ProfitBarChart, type ProfitBarRow } from "@/components/materials/ProfitBarChart";
import { RoasBepChart } from "@/components/materials/RoasBepChart";
import { VideoDropoff } from "@/components/materials/VideoDropoff";
import { MetricGroups } from "@/components/dashboard/detail/MetricGroups";
import { VerdictHeader } from "@/components/materials/detail/VerdictHeader";
import { KeyMetricsStrip } from "@/components/materials/detail/KeyMetricsStrip";
import { ReasonList } from "@/components/materials/detail/ReasonList";
import { Collapse } from "@/components/materials/detail/Collapse";
import { ReportCopy } from "@/components/materials/detail/ReportCopy";
import { LoadingScreen, EmptyState } from "@/components/ui/common";
import { cn } from "@/lib/cn";

function numOrNull(s: string): number | null {
  const t = s.trim().replace(/%$/, "");
  if (t === "") return null;
  const n = Number(t.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return n < 0 ? 0 : n;
}

export function IntegratedView() {
  const { materials, selected, settings, backToLibrary } = useMaterials();
  const [decided, setDecided] = useState<DedupMode | null>(null);
  const [mergeKey, setMergeKey] = useState<string | null>(null);
  const [bepRoas, setBepRoas] = useState<number | null>(null); // 통합 공통 BEP ROAS
  const [bepCalcOpen, setBepCalcOpen] = useState(false); // BEP ROAS 계산기 모달
  const [statusMap, setStatusMap] = useState<Record<string, AdStatus>>({}); // 광고키 → 운영 상태 (Supabase)
  const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("all"); // 통합 요약표 판정 필터
  const [statusFilter, setStatusFilter] = useState<"all" | AdStatus>("all"); // 통합 요약표 운영 상태 필터
  const [statusError, setStatusError] = useState<string | null>(null);

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

  const mats = useMemo(
    () => selected.map((id) => materials.find((m) => m.id === id)).filter(Boolean).map((m) => buildMaterialAnalysis(m!, settings)),
    [selected, materials, settings],
  );
  const result = useMemo(() => integrate(mats, decided ?? "exclude", settings), [mats, decided, settings]);
  const totalGroups = useMemo(() => metricGroupsForAgg(result.totalAgg, result.present), [result]);

  // 판정은 '표시되는 통합 ROAS(estimatedRoas)'와 '현재 입력 BEP ROAS'로 파생 — BEP 변경 시 즉시 재계산.
  const verdictMap = useMemo(() => {
    const m = new Map<string, VerdictCode>();
    for (const mg of result.merged) m.set(mg.mergeKey, integratedVerdict(mg.estimatedRoas, bepRoas));
    return m;
  }, [result, bepRoas]);
  const roasMap = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const mg of result.merged) m.set(mg.mergeKey, mg.estimatedRoas);
    return m;
  }, [result]);

  if (mats.length < 2) {
    return (<div className="min-h-screen bg-slate-50 p-6"><EmptyState title="통합 분석은 2개 이상 선택해야 합니다" /><button onClick={backToLibrary} className="mt-3 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white">목록으로</button></div>);
  }

  const names = result.materials.map((m) => m.name);
  const nameLabel = names.length <= 2 ? names.join(" · ") : `${names.slice(0, 2).join(" · ")} 외 ${names.length - 2}개`;
  const needDecision = result.duplicates.length > 0 && decided === null;

  const items: AdItem[] = result.merged.map((mg) => ({
    ad: { key: mg.mergeKey, adId: mg.adId, adName: mg.adName, adSetKey: "", adSetName: "", accountName: "", campaignName: mergedCampaignDisplay(mg.campaignNames).full.join(", "), creativeType: mg.creativeType, agg: mg.agg },
    an: synthAnalysis(mg.adName, mg.agg, mg.present, settings),
  }));
  const selectedMerged: MergedAd | undefined = mergeKey ? result.merged.find((m) => m.mergeKey === mergeKey) : undefined;

  const verdictFor = (k: string) => verdictMap.get(k);
  const roasFor = (k: string) => roasMap.get(k);
  const statusFor = (k: string): AdStatus => statusMap[k] ?? "active";
  const setStatus = (k: string, s: AdStatus) => {
    const prevStatus = statusMap[k] ?? "active";
    setStatusMap((prev) => ({ ...prev, [k]: s }));
    setStatusError(null);
    // 공용 저장 실패 시 낙관적 변경을 되돌리고, 저장된 것처럼 오인시키지 않는다.
    putAdStatus(k, s).catch((e) => {
      setStatusMap((prev) => ({ ...prev, [k]: prevStatus }));
      setStatusError(`운영 상태를 공용 저장소에 저장하지 못했습니다. 변경이 반영되지 않았습니다. 다시 시도해주세요.${e instanceof Error && e.message ? ` (${e.message})` : ""}`);
    });
  };
  // 표시(소수 1자리) 기준으로 판정/차이를 계산해 화면 값과 어긋나지 않게 한다.
  const rr = (r: number | null) => (r == null ? null : Math.round(r * 10) / 10);
  const diffOf = (est: number | null) => { const s = rr(est); return s != null && bepRoas != null ? s - bepRoas : null; };

  // 판정 필터 + 운영 상태 필터 (표시 대상만 변경, 계산/판정/mergeKey 불변)
  const passVerdict = (k: string) => verdictFilter === "all" || verdictMap.get(k) === verdictFilter;
  const passStatus = (k: string) => statusFilter === "all" || statusFor(k) === statusFilter;
  const visibleItems = items.filter((it) => passVerdict(it.ad.key) && passStatus(it.ad.key));
  const verdictCount = (v: VerdictCode | "all") => (v === "all" ? result.merged.length : result.merged.filter((mg) => verdictMap.get(mg.mergeKey) === v).length);
  const statusCount = (s: AdStatus | "all") => (s === "all" ? result.merged.length : result.merged.filter((mg) => statusFor(mg.mergeKey) === s).length);

  const barRows: ProfitBarRow[] = result.merged.map((mg) => ({
    key: mg.mergeKey,
    name: mg.adName,
    estimatedRoas: mg.estimatedRoas,
    bepRoas,
    diffPp: diffOf(mg.estimatedRoas),
    verdict: profitVerdictOf(rr(mg.estimatedRoas), bepRoas),
    tags: [],
  }));

  const Header = (
    <header className="sticky top-0 z-30 shrink-0 border-b border-slate-200 bg-white px-5 py-2.5">
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <AnalysisNav onHome={backToLibrary} onBack={() => (mergeKey ? setMergeKey(null) : backToLibrary())} />
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold text-slate-800" title={mergeKey && selectedMerged ? selectedMerged.adName : undefined}>
            {mergeKey && selectedMerged ? selectedMerged.adName : `통합 분석 · 선택 자료 ${mats.length}개`}
          </h1>
          <p className="truncate text-[11px] text-slate-400" title={names.join(", ")}>{mergeKey && selectedMerged ? `통합 분석 · 선택 자료 ${mats.length}개` : nameLabel}</p>
        </div>
      </div>
    </header>
  );

  const BepInput = (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-bold text-slate-700">수익성 입력 (통합 공통)</h3>
      <p className="mt-0.5 text-[11px] text-slate-400">BEP ROAS 직접 입력 · 입력 즉시 판정·그래프가 다시 계산됩니다</p>
      <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span className="whitespace-nowrap font-medium">BEP ROAS (%)</span>
        <input type="number" min={0} step="0.1" value={bepRoas ?? ""} onChange={(e) => setBepRoas(numOrNull(e.target.value))} placeholder="예: 220"
          className="w-36 rounded-md border border-slate-300 px-2 py-1 text-right text-sm outline-none focus:border-brand" />
        <button
          type="button"
          onClick={() => setBepCalcOpen(true)}
          className="whitespace-nowrap rounded-md border border-brand/40 bg-brand/5 px-2.5 py-1 font-medium text-brand hover:bg-brand/10"
        >
          BEP ROAS 계산하기
        </button>
        <span className="text-slate-400">{bepRoas != null ? `${bepRoas.toFixed(1)}% 적용 중` : "미입력"}</span>
      </label>
      <BepRoasCalculator open={bepCalcOpen} onClose={() => setBepCalcOpen(false)} onApply={(v) => setBepRoas(v)} />
    </section>
  );

  const warnings = (
    <>
      {result.periodOverlap && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          선택한 분석 자료의 기간이 겹칩니다. 집계 CSV의 경우 중복 기간 데이터를 정확히 분리할 수 없어 성과가 중복 계산될 수 있습니다.
        </div>
      )}
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500">
        통합 자료의 도달 및 빈도는 CSV 간 동일 사용자 중복을 제거할 수 없어 근사치입니다.
      </div>
    </>
  );

  // ── 광고 하나 선택 시: master-detail ──
  if (mergeKey && selectedMerged) {
    const overall = synthAnalysis(selectedMerged.adName, selectedMerged.agg, selectedMerged.present, settings);
    const vCode = integratedVerdict(selectedMerged.estimatedRoas, bepRoas); // 통합 성과 판정
    const est = selectedMerged.estimatedRoas;
    // 통합 소재 공유용 요약 값 — 광고 비교(통합)와 동일한 통합 결과 재사용
    const sharedProfit: AdProfitView = {
      key: selectedMerged.mergeKey,
      adName: selectedMerged.adName,
      creativeType: selectedMerged.creativeType,
      estimatedRoas: est,
      bepRoas,
      diffPp: diffOf(est),
      verdict: profitVerdictOf(rr(est), bepRoas),
      metaRoas: metaRoasOf(selectedMerged.agg, selectedMerged.present),
    };
    // 단계별 성과 분석 + 판단 보조 (선택 소재 중앙값 대비) + 실제 데이터 포함 기간
    const stage = analyzeStages(selectedMerged, result.merged, bepRoas);

    return (
      <div className="flex h-screen flex-col bg-slate-50">
        {Header}
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="scroll-thin max-h-56 shrink-0 overflow-y-auto border-b border-slate-200 bg-white p-3 lg:max-h-none lg:w-[300px] lg:border-b-0 lg:border-r">
            <h2 className="mb-2 text-sm font-bold text-slate-700">광고 탐색 (통합)</h2>
            <AdPickerList items={items} selectedKey={mergeKey} onSelect={setMergeKey} statusFor={statusFor} verdictFor={verdictFor} roasFor={roasFor} />
          </div>
          <div className="scroll-thin min-w-0 flex-1 overflow-y-auto p-4">
            <div className="mx-auto max-w-6xl space-y-3">
              {/* ①②: 소재 헤더 + 운영 판단 (통합 1차 판정) */}
              <VerdictHeader
                name={selectedMerged.adName}
                campaign={mergedCampaignDisplay(selectedMerged.campaignNames).full.join(", ") || null}
                creativeType={selectedMerged.creativeType}
                adStatus={AD_STATUS_LABEL[statusFor(selectedMerged.mergeKey)]}
                periodLabel={stage.dataStart && stage.dataEnd ? `${stage.dataStart} ~ ${stage.dataEnd}` : null}
                elapsedDays={stage.elapsed}
                verdictCode={vCode}
                profitVerdict={sharedProfit.verdict}
                dataSufficiency={selectedMerged.verdict.dataSufficiency}
                confidence={selectedMerged.verdict.confidence}
                caution={selectedMerged.verdict.caution}
                alerts={bepRoas == null ? ["BEP ROAS 미입력 — 수익성 비교 불가. 통합 요약 화면에서 BEP ROAS를 입력하면 판정·그래프가 다시 계산됩니다."] : []}
              />

              {/* ③ 핵심 성과 */}
              <KeyMetricsStrip cur={selectedMerged.agg} present={selectedMerged.present} groups={overall.groups} profit={sharedProfit} />

              {/* ④ 판단 근거 (기존 판단 보조 재사용) */}
              <ReasonList reasons={[stage.advisory, "‘중단 검토’는 OFF 확정이 아니라 BEP 미달 소재를 상세 확인 대상으로 거르는 1차 판정입니다."]} />

              {/* ⑤ 세부 분석 (접힘) */}
              <div className="space-y-2">
                <Collapse title="통합 성과지표 상세 · raw 합산 후 재계산 (CPM · CPC · 랜딩 · 구매매출)">
                  <MetricGroups groups={overall.groups} />
                </Collapse>
                <Collapse title="수익성 상세 (ROAS vs BEP ROAS)">
                  <RoasBepChart p={{ estimatedRoas: est, bepRoas, diffPp: diffOf(est), verdict: profitVerdictOf(rr(est), bepRoas), metaRoas: metaRoasOf(selectedMerged.agg, selectedMerged.present) }} />
                </Collapse>
                <Collapse title="단계별 성과 분석 (퍼널)">
                  <IntegratedStageAnalysis stages={stage.stages} />
                </Collapse>
                {(selectedMerged.creativeType === "video" || selectedMerged.agg.hasVideoData) && (
                  <Collapse title="영상 분석 (구간 이탈)">
                    <VideoDropoff agg={selectedMerged.agg} present={selectedMerged.present} isVideo={selectedMerged.creativeType === "video"} />
                  </Collapse>
                )}
              </div>

              {/* ⑥ 보고용 (기존 ShareSummary 재사용) */}
              <ReportCopy>
                <ShareSummary
                  title={selectedMerged.adName}
                  perf={overall}
                  profit={sharedProfit}
                  startDate={stage.dataStart}
                  elapsedDays={stage.elapsed}
                  perfVerdictOverride={vCode}
                  present={selectedMerged.present}
                  nameStart={stage.nameStart}
                  dataStart={stage.dataStart}
                  dataEnd={stage.dataEnd}
                  dataDays={stage.dataDays}
                />
              </ReportCopy>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── 통합 요약 ──
  return (
    <div className="min-h-screen bg-slate-50">
      {Header}
      <main className="mx-auto max-w-6xl space-y-3 px-5 py-4">
        {needDecision && (
          <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
            <h2 className="text-sm font-bold text-amber-800">중복 데이터 감지</h2>
            <p className="mt-1 text-xs text-amber-700">선택한 분석 자료에 동일 광고/동일 기간 데이터가 중복되어 있습니다.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setDecided("exclude")} className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">중복 제외하고 분석 (권장)</button>
              <button onClick={() => setDecided("include")} className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100">중복 포함</button>
              <button onClick={backToLibrary} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white">취소</button>
            </div>
          </section>
        )}

        {/* 캡처용 상단 KPI + ROAS/BEP 그래프 */}
        <IntegratedKpiHeader
          materialCount={mats.length}
          adCount={result.merged.length}
          spend={result.totalSpend}
          roas={result.integratedEstimatedRoas}
          bepRoas={bepRoas}
          cpm={findMetric(totalGroups, "cpm")}
          ctr={findMetric(totalGroups, "ctr")}
          cpc={findMetric(totalGroups, "cpc")}
          cvr={findMetric(totalGroups, "purchaseRate")}
          graph={{ estimatedRoas: result.integratedEstimatedRoas, bepRoas, diffPp: diffOf(result.integratedEstimatedRoas), verdict: profitVerdictOf(rr(result.integratedEstimatedRoas), bepRoas), metaRoas: metaRoasOf(result.totalAgg, result.present) }}
        />

        {BepInput}
        {warnings}

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="mb-2 text-sm font-bold text-slate-700">광고 비교 (통합) — 동일 광고 1행</h3>

          {/* 판정 필터 */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-medium text-slate-400">판정</span>
            {([["all", "전체"], ["keep", "유지"], ["pause_candidate", "중단 검토"], ["monitor", "추가 관찰"]] as const).map(([v, label]) => (
              <button key={v} onClick={() => setVerdictFilter(v)}
                className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium", verdictFilter === v ? "border-brand bg-brand text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50")}>
                {label} {verdictCount(v)}
              </button>
            ))}
          </div>
          {/* 운영 상태 필터 */}
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] font-medium text-slate-400">운영 상태</span>
            {(["all", ...AD_STATUS_OPTIONS] as const).map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={cn("rounded-full border px-2.5 py-0.5 text-[11px] font-medium", statusFilter === s ? "border-brand bg-brand text-white" : "border-slate-300 text-slate-600 hover:bg-slate-50")}>
                {s === "all" ? "전체" : AD_STATUS_LABEL[s]} {statusCount(s)}
              </button>
            ))}
          </div>

          {statusError && <div className="mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">{statusError}</div>}
          <AdsTable items={visibleItems} onSelect={setMergeKey} showVerdict verdictFor={verdictFor} roasFor={roasFor} sortable statusFor={statusFor} onStatusChange={setStatus} showCampaign />
          {visibleItems.length === 0 && <p className="py-3 text-center text-[11px] text-slate-400">선택한 필터에 해당하는 광고가 없습니다.</p>}
          <p className="mt-1.5 text-[10px] text-slate-400">광고/유형 제목을 클릭해 정렬(자연 정렬). 판정·운영 상태 필터는 표시 대상만 바꿉니다. 운영 상태는 자동 판정과 별개로 저장됩니다. 광고를 클릭하면 통합 상세를 볼 수 있습니다.</p>
        </section>

        {/* 소재별 수익성 비교 — 페이지 맨 아래 */}
        <ProfitBarChart rows={barRows} title="소재별 수익성 비교 (통합)" />
      </main>
    </div>
  );
}
