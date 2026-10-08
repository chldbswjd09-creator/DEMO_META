// 표시 형식 유틸 — 원화/퍼센트/소수점 일관 적용

import type { MetricResult, MetricUnit } from "@/lib/types";

const krwFormatter = new Intl.NumberFormat("ko-KR", {
  maximumFractionDigits: 0,
});

export function formatKRW(value: number): string {
  return `${krwFormatter.format(Math.round(value))}원`;
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("ko-KR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

export function formatPct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatRatio(value: number, digits = 2): string {
  return value.toFixed(digits);
}

// 지표 값(숫자 + 상태)을 화면 문자열로
export function formatMetricValue(m: MetricResult): string {
  if (m.state === "missing_column") return "원본 열 없음";
  if (m.state === "na") return "적용 대상 아님";
  if (m.state === "no_data") return "데이터 없음";
  if (m.state === "no_purchase") return "구매 없음";
  if (m.state === "cannot_calc") return "계산 불가";
  if (m.current === null) return "—";
  return formatByUnit(m.current, m.unit);
}

export function formatPreviousValue(m: MetricResult): string {
  if (m.changeNote === "no_previous") return "이전 데이터 없음";
  if (m.previous === null) return "—";
  return formatByUnit(m.previous, m.unit);
}

export function formatByUnit(value: number, unit: MetricUnit): string {
  switch (unit) {
    case "krw":
    case "krw_per_1000":
      return formatKRW(value);
    case "pct":
      return formatPct(value);
    case "ratio":
      return formatRatio(value);
    case "count":
      return formatNumber(value);
    default:
      return String(value);
  }
}

// 증감률 표시
export function formatChange(m: MetricResult): {
  text: string;
  tone: "positive" | "negative" | "neutral";
} {
  if (m.changeNote === "no_previous")
    return { text: "이전 데이터 없음", tone: "neutral" };
  if (m.changeNote === "new") return { text: "신규 발생", tone: "neutral" };
  if (m.changePct === null) return { text: "—", tone: "neutral" };

  const arrow = m.changePct > 0 ? "▲" : m.changePct < 0 ? "▼" : "—";
  const abs = Math.abs(m.changePct);
  const text = `${arrow} ${abs.toFixed(1)}%`;

  // 방향성 기반 긍정/주의 판정
  let tone: "positive" | "negative" | "neutral" = "neutral";
  if (m.changePct === 0 || m.direction === "neutral") {
    tone = "neutral";
  } else if (m.direction === "higher_better") {
    tone = m.changePct > 0 ? "positive" : "negative";
  } else {
    tone = m.changePct < 0 ? "positive" : "negative";
  }
  return { text, tone };
}

// 날짜 표시
export function formatDate(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${mm}-${dd} ${hh}:${mi}`;
}
