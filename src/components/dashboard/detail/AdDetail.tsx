"use client";

// 소재 상세 성과 (단일 자료) — 정보 계층 재정리 버전.
// ① 소재 헤더 · ② 운영 판단 → ③ 핵심 성과 → ④ 판단 근거 → ⑤ 세부 분석(접힘) → ⑥ 보고용.
// 계산/판정/문구 생성 로직은 그대로 재사용하고, 표시 구조(배치·접기)만 정리한다.

import type { AnalysisSettings, Contribution } from "@/lib/types";
import type { AdRow } from "@/lib/services/api";
import type { CsvAdAnalysis } from "@/lib/csv/analyze";
import type { AdProfitView } from "@/lib/materials/profitView";
import { findMetric } from "@/lib/metrics/calc";
import { EmptyState, creativeLabel } from "@/components/ui/common";
import { MetricGroups } from "./MetricGroups";
import { ContributionCard } from "./ContributionCard";
import { SetComparison } from "./SetComparison";
import { ShareSummary } from "@/components/materials/ShareSummary";
import { RoasBepChart } from "@/components/materials/RoasBepChart";
import { VideoDropoff } from "@/components/materials/VideoDropoff";
import { VerdictHeader } from "@/components/materials/detail/VerdictHeader";
import { KeyMetricsStrip } from "@/components/materials/detail/KeyMetricsStrip";
import { ReasonList } from "@/components/materials/detail/ReasonList";
import { Collapse } from "@/components/materials/detail/Collapse";
import { ReportCopy } from "@/components/materials/detail/ReportCopy";
import { normalizeCampaign } from "@/lib/materials/campaign";
import { formatKRW, formatNumber, formatPct } from "@/lib/metrics/format";
import { profitSentence, profitIssueSentence, diffPpText } from "@/lib/materials/profitCopy";
import { cn } from "@/lib/cn";

function Raw({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-1">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800">{value}</span>
    </div>
  );
}

const PROFIT_TONE: Record<string, string> = {
  "BEP 초과": "bg-emerald-50 text-emerald-700 border-emerald-300",
  "BEP 미달": "bg-rose-50 text-rose-700 border-rose-300",
  손익분기: "bg-slate-100 text-slate-700 border-slate-300",
};

export function AdDetail({
  analysis,
  contributions,
  setAds,
  campaignName,
  adSetName,
  settings,
  viewMode,
  rangeLabel,
  prevRangeLabel,
  hideSetComparison = false,
  profit,
  startDate,
  elapsedDays,
  present,
}: {
  analysis: CsvAdAnalysis;
  contributions: Record<Contribution["scope"], Contribution>;
  setAds: AdRow[];
  campaignName: string;
  adSetName: string;
  settings: AnalysisSettings;
  viewMode: "summary" | "detail";
  rangeLabel: string;
  prevRangeLabel: string;
  hideSetComparison?: boolean;
  profit?: AdProfitView | null;
  startDate?: string | null;
  elapsedDays?: number | null;
  present?: import("@/lib/csv/columnMap").PerfField[];
}) {
  if (!analysis) return <EmptyState title="광고를 찾을 수 없습니다" icon="⚠" />;

  const { ad, verdict, groups, cur, record } = analysis;
  const steps = buildDiagnosisSteps(analysis, settings);
  const hasVideoCol = cur.hasVideoData;
  const dataInsufficient = verdict.dataSufficiency === "부족" || verdict.code === "monitor";
  const cpaMetric = findMetric(groups, "cpa");
  const cpaOverTarget = cpaMetric?.state === "ok" && cpaMetric.current != null ? cpaMetric.current > settings.targetCpa : null;

  // 항상 노출할 중요 상태 (접지 않음)
  const alerts: string[] = [];
  if (profit && profit.bepRoas == null) alerts.push("BEP ROAS 미입력 — 수익성 비교 불가. 「자료 전체」 화면에서 BEP ROAS를 입력하면 이 소재의 수익성 판정이 표시됩니다.");
  if (verdict.dataSufficiency === "부족") alerts.push("데이터가 부족해 현재 성과를 확정하기 어렵습니다. 추가 관찰이 필요합니다.");

  const showVideo = present !== undefined && (ad.creativeType === "video" || hasVideoCol);

  return (
    <div className="space-y-3">
      {/* ① 소재 헤더 + ② 운영 판단 */}
      <VerdictHeader
        name={ad.name}
        campaign={normalizeCampaign(campaignName)}
        creativeType={ad.creativeType}
        adStatus={record.adStatus ?? undefined}
        periodLabel={rangeLabel}
        elapsedDays={elapsedDays}
        isNew={analysis.isNew}
        creativeAutoNote={analysis.creativeTypeAuto ? `소재 유형이 CSV에 없어 영상 재생 데이터로 자동 추정했습니다 (${creativeLabel(ad.creativeType)}).` : null}
        verdictCode={verdict.code}
        actionSentence={verdict.action}
        profitVerdict={profit?.verdict ?? null}
        dataSufficiency={verdict.dataSufficiency}
        confidence={verdict.confidence}
        caution={verdict.caution}
        alerts={alerts}
      />

      {/* ③ 핵심 성과 */}
      <KeyMetricsStrip cur={cur} present={present} groups={groups} profit={profit ?? null} />

      {/* ④ 판단 근거 */}
      <ReasonList reasons={verdict.reasons} />

      {/* ⑤ 세부 분석 (필요할 때 펼치기) */}
      <div className="space-y-2">
        <Collapse title="성과 지표 상세 · 이전 기간 비교 (CPM · CPC · 랜딩 · 구매매출)">
          <MetricGroups groups={groups} />
        </Collapse>

        {profit && (
          <Collapse title="수익성 상세 (ROAS vs BEP ROAS)">
            <RoasBepChart p={profit} />
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                <DiagNum label="추정 ROAS" value={profit.estimatedRoas == null ? "계산 불가" : formatPct(profit.estimatedRoas)} muted={profit.estimatedRoas == null} />
                <DiagNum label="BEP ROAS" value={profit.bepRoas == null ? "미입력" : formatPct(profit.bepRoas)} muted={profit.bepRoas == null} />
                <DiagNum label="BEP 대비" value={profit.diffPp == null ? "-" : diffPpText(profit.diffPp)} tone={profit.diffPp == null ? undefined : profit.diffPp > 0 ? "text-emerald-600" : profit.diffPp < 0 ? "text-rose-600" : undefined} />
                <div>
                  <p className="text-[10px] text-slate-400">수익성 판정</p>
                  <span className={cn("mt-0.5 inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold", PROFIT_TONE[profit.verdict] ?? "border-slate-300 bg-slate-100 text-slate-500")}>{profit.verdict}</span>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-600">
                {profitSentence({ name: ad.name, estimatedRoas: profit.estimatedRoas, bepRoas: profit.bepRoas, diffPp: profit.diffPp, verdict: profit.verdict, dataInsufficient })}
              </p>
              {(() => {
                const issue = profitIssueSentence(profit.verdict, cpaOverTarget, dataInsufficient);
                return issue ? <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{issue}</p> : null;
              })()}
            </div>
          </Collapse>
        )}

        <Collapse title="자동 진단 (성과 · 데이터)">
          <p className="mb-1.5 text-[11px] font-bold text-slate-600">성과 진단</p>
          <ol className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className={s.tone === "good" ? "text-emerald-600" : s.tone === "warn" ? "text-amber-600" : s.tone === "bad" ? "text-rose-600" : "text-slate-400"} aria-hidden>
                  {s.tone === "good" ? "✓" : s.tone === "warn" ? "△" : s.tone === "bad" ? "✕" : "·"}
                </span>
                <span className="text-slate-600"><b className="text-slate-700">{s.title}</b> — {s.text}</span>
              </li>
            ))}
          </ol>
          <p className="mb-1.5 mt-3 text-[11px] font-bold text-slate-600">데이터 진단</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
            <Raw label="집행 시작일" value={startDate || "정보 없음"} />
            <Raw label="집행 경과일" value={elapsedDays != null ? `${elapsedDays}일` : "-"} />
            <Raw label="광고비" value={formatKRW(cur.spend)} />
            <Raw label="구매 수" value={cpaMetric?.state === "missing_column" ? "구매 열 없음" : formatNumber(cur.purchases)} />
            <Raw label="데이터 충분도" value={verdict.dataSufficiency} />
            <Raw label="판정 신뢰도" value={verdict.confidence} />
          </div>
          {analysis.missingDiagnoses.length > 0 && (
            <div className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              {analysis.missingDiagnoses.map((m, i) => <p key={i}>· {m}</p>)}
            </div>
          )}
        </Collapse>

        {viewMode === "detail" && (
          <Collapse title="광고비 비중 대비 구매·매출 기여도">
            <ContributionCard contributions={contributions} />
          </Collapse>
        )}

        {viewMode === "detail" && !hideSetComparison && (
          <Collapse title="광고 비교">
            <SetComparison rows={setAds} selectedId={ad.id} />
          </Collapse>
        )}

        {showVideo && (
          <Collapse title="영상 분석 (구간 이탈)">
            <VideoDropoff agg={cur} present={present!} isVideo={ad.creativeType === "video"} />
          </Collapse>
        )}

        {viewMode === "detail" && (
          <Collapse title="상세 원본 데이터">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs md:grid-cols-3">
              <Raw label="광고비" value={formatKRW(cur.spend)} />
              <Raw label="노출" value={formatNumber(cur.impressions)} />
              <Raw label="도달" value={formatNumber(cur.reach)} />
              <Raw label="링크 클릭" value={record.cur ? formatNumber(cur.linkClicks) : "-"} />
              <Raw label="랜딩페이지 조회" value={formatNumber(cur.landingPageViews)} />
              <Raw label="구매 수" value={formatNumber(cur.purchases)} />
              <Raw label="구매 매출" value={formatKRW(cur.purchaseValue)} />
              <Raw label="3초 재생" value={hasVideoCol ? formatNumber(cur.video3s) : "원본 열 없음"} />
              <Raw label="50% 재생" value={hasVideoCol ? formatNumber(cur.video50) : "원본 열 없음"} />
              <Raw label="100% 재생" value={hasVideoCol ? formatNumber(cur.video100) : "원본 열 없음"} />
            </div>
            <p className="mt-2 text-[10px] text-slate-400">비교 기간: {analysis.hasPrevData ? prevRangeLabel : "비교 데이터 없음"} · 광고 ID: {record.adId ?? "(ID 없음 — 이름 기준)"} · 광고세트: {adSetName}</p>
          </Collapse>
        )}
      </div>

      {/* ⑥ 보고용 (하단, 작게 — 기존 ShareSummary 재사용) */}
      {profit && (
        <ReportCopy>
          <ShareSummary title={ad.name} perf={analysis} profit={profit} startDate={startDate} elapsedDays={elapsedDays} present={present} />
        </ReportCopy>
      )}
    </div>
  );
}

function DiagNum({ label, value, muted, tone }: { label: string; value: string; muted?: boolean; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-slate-400">{label}</p>
      <p className={cn("truncate text-sm font-bold", tone ?? (muted ? "text-slate-400" : "text-slate-800"))}>{value}</p>
    </div>
  );
}

interface DiagStep {
  title: string;
  text: string;
  tone: "good" | "warn" | "bad" | "neutral";
}

function buildDiagnosisSteps(analysis: CsvAdAnalysis, settings: AnalysisSettings): DiagStep[] {
  const g = analysis.groups;
  const isVideo = analysis.ad.creativeType === "video";
  const get = (k: string) => findMetric(g, k);
  const missing = (k: string) => get(k)?.state === "missing_column";
  const val = (k: string) => get(k)?.current ?? null;

  const cmp = (v: number | null, base: number, higherBetter: boolean, k: string): DiagStep["tone"] => {
    if (missing(k)) return "neutral";
    if (v === null) return "neutral";
    return higherBetter ? (v >= base ? "good" : "warn") : v <= base ? "good" : "warn";
  };
  const line = (k: string, label: string, unit: string): string => {
    if (missing(k)) return "원본 열 없음";
    const v = val(k);
    if (v === null) return "데이터 없음";
    return `${label} ${unit === "krw" ? Math.round(v).toLocaleString() + "원" : v.toFixed(unit === "int" ? 0 : unit === "roas" ? 0 : 2) + (unit === "pct" ? "%" : "")}`;
  };

  return [
    { title: "CPA", text: line("cpa", "CPA", "krw"), tone: cmp(val("cpa"), settings.targetCpa, false, "cpa") },
    { title: "구매 전환율", text: line("purchaseRate", "구매 전환율", "pct"), tone: cmp(val("purchaseRate"), settings.basePurchaseRate, true, "purchaseRate") },
    { title: "CTR", text: line("ctr", "CTR", "pct"), tone: cmp(val("ctr"), settings.baseCtr, true, "ctr") },
    { title: "CPC", text: line("cpc", "CPC", "krw"), tone: cmp(val("cpc"), settings.baseCpc, false, "cpc") },
    { title: "랜딩 효율", text: line("landingRate", "랜딩 도달률", "pct"), tone: cmp(val("landingRate"), settings.baseLandingRate, true, "landingRate") },
    isVideo
      ? { title: "영상 유지", text: line("hookRate", "후킹률", "pct"), tone: cmp(val("hookRate"), settings.baseHookRate, true, "hookRate") }
      : { title: "영상 유지", text: "영상 소재가 아니므로 적용 대상이 아닙니다.", tone: "neutral" },
    { title: "이전 대비", text: analysis.hasPrevData ? "이전 기간과 비교해 추이를 확인했습니다." : "비교 데이터 없음", tone: "neutral" },
  ];
}
