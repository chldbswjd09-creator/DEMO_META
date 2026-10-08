import { describe, it, expect } from "vitest";
import { genDailyInsights, genVideoInsights } from "@/lib/mock/insights";
import { analyzeAd } from "@/lib/analysis/analyze";
import { DEFAULT_SETTINGS } from "@/lib/verdict/settings";
import type { DateRange } from "@/lib/types";

// 목업 광고의 createdTime 은 실제 시계(daysAgoISO) 기준으로 생성되므로,
// 테스트 기준일(NOW)·조회 기간(RANGE)도 동일하게 실제 시계 기준으로 잡아야
// daysRunning(=range.end − createdTime)이 실제와 어긋나지 않는다(프로덕션 로직은 그대로).
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const NOW = new Date();
const rangeEnd = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - 1); // 어제
const rangeStart = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), rangeEnd.getDate() - 6); // 최근 7일 창
const RANGE: DateRange = { start: ymd(rangeStart), end: ymd(rangeEnd) };

describe("샘플 데이터 생성기 — 결정론", () => {
  it("같은 광고+기간+기준일이면 항상 동일한 일별 데이터", () => {
    const a = genDailyInsights("ad_1", RANGE, NOW);
    const b = genDailyInsights("ad_1", RANGE, NOW);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("영상 광고(ad_1)는 영상 인사이트를 생성한다", () => {
    const v = genVideoInsights("ad_1", RANGE, NOW);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].videoComplete).toBe(true);
  });

  it("이미지 광고(ad_2)는 영상 인사이트가 없다", () => {
    expect(genVideoInsights("ad_2", RANGE, NOW)).toHaveLength(0);
  });

  it("존재하지 않는 광고는 빈 배열", () => {
    expect(genDailyInsights("nope", RANGE, NOW)).toHaveLength(0);
  });
});

describe("분석 파이프라인 — 결정론 (같은 데이터 → 같은 판정)", () => {
  it("analyzeAd를 반복 호출해도 동일한 판정/지표", () => {
    const a = analyzeAd("ad_1", RANGE, NOW, DEFAULT_SETTINGS);
    const b = analyzeAd("ad_1", RANGE, NOW, DEFAULT_SETTINGS);
    expect(a?.verdict).toEqual(b?.verdict);
    expect(a?.cur).toEqual(b?.cur);
  });

  it("우수 소재(ad_1)는 확장 후보/유지 계열로 판정", () => {
    const a = analyzeAd("ad_1", RANGE, NOW, DEFAULT_SETTINGS);
    expect(["scale_candidate", "keep"]).toContain(a?.verdict.code);
  });
});
