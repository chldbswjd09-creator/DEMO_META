// 조회 기간 / 이전 기간 계산 유틸

import type { DateRange } from "@/lib/types";

export type PresetRange = "3d" | "7d" | "14d" | "30d" | "custom";

export const PRESET_LABELS: Record<Exclude<PresetRange, "custom">, string> = {
  "3d": "최근 3일",
  "7d": "최근 7일",
  "14d": "최근 14일",
  "30d": "최근 30일",
};

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseYMD(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function daysBetween(start: string, end: string): number {
  const s = parseYMD(start).getTime();
  const e = parseYMD(end).getTime();
  return Math.round((e - s) / 86_400_000) + 1; // 양끝 포함
}

// preset → DateRange (오늘 기준, 어제까지 데이터가 있다고 가정)
export function presetToRange(preset: Exclude<PresetRange, "custom">, today: Date): DateRange {
  const days = preset === "3d" ? 3 : preset === "7d" ? 7 : preset === "14d" ? 14 : 30;
  const end = new Date(today);
  end.setDate(end.getDate() - 1); // 어제
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  return { start: toYMD(start), end: toYMD(end) };
}

// 동일 일수의 직전 기간
export function previousRange(range: DateRange): DateRange {
  const days = daysBetween(range.start, range.end);
  const prevEnd = parseYMD(range.start);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return { start: toYMD(prevStart), end: toYMD(prevEnd) };
}

export function eachDate(range: DateRange): string[] {
  const out: string[] = [];
  const cur = parseYMD(range.start);
  const end = parseYMD(range.end);
  while (cur.getTime() <= end.getTime()) {
    out.push(toYMD(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function rangeLabel(range: DateRange): string {
  const s = parseYMD(range.start);
  const e = parseYMD(range.end);
  const f = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  return `${f(s)} ~ ${f(e)}`;
}
