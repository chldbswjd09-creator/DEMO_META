import { describe, it, expect } from "vitest";
import { daysBetween, eachDate, presetToRange, previousRange } from "@/lib/metrics/periods";

describe("기간 계산", () => {
  it("daysBetween는 양끝 포함 일수", () => {
    expect(daysBetween("2026-08-01", "2026-08-07")).toBe(7);
    expect(daysBetween("2026-08-01", "2026-08-01")).toBe(1);
  });

  it("previousRange는 동일 일수의 직전 기간", () => {
    // 스펙 예시: 현재 8/1~8/7 → 이전 7/25~7/31
    expect(previousRange({ start: "2026-08-01", end: "2026-08-07" })).toEqual({
      start: "2026-07-25",
      end: "2026-07-31",
    });
  });

  it("presetToRange(7d)는 어제까지 7일", () => {
    const today = new Date(2026, 7, 6); // 2026-08-06 (월 0-index)
    expect(presetToRange("7d", today)).toEqual({ start: "2026-07-30", end: "2026-08-05" });
  });

  it("eachDate는 기간 내 모든 날짜를 반환", () => {
    expect(eachDate({ start: "2026-08-01", end: "2026-08-03" })).toEqual([
      "2026-08-01",
      "2026-08-02",
      "2026-08-03",
    ]);
  });

  it("커스텀 기간도 동일 일수의 직전 기간과 비교", () => {
    const r = { start: "2026-08-10", end: "2026-08-12" }; // 3일
    const p = previousRange(r);
    expect(daysBetween(p.start, p.end)).toBe(3);
    expect(p).toEqual({ start: "2026-08-07", end: "2026-08-09" });
  });
});
