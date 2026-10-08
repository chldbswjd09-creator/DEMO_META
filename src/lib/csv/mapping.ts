// CSV 헤더 → 표준 필드 자동 매핑 + 검증.

import {
  type CanonicalField,
  type PerfField,
  FIELD_SPECS,
  FIELD_BY_KEY,
  PERF_FIELDS,
  compact,
  normalizeHeader,
} from "@/lib/csv/columnMap";

export interface FieldMapping {
  header: string | null;
  confidence: number; // 0~1
  auto: boolean;
}

export type Mapping = Record<CanonicalField, FieldMapping>;

const THRESHOLD = 0.7;

// 구매 계열 열 판별 마커 — '구매/결과' 계열 열이 서로 오염되지 않도록 강하게 구분한다.
// 예) '웹사이트 직접 구매'(건수) vs '웹사이트 직접 구매 전환값'(매출) vs '구매 ROAS'(수익률) vs '결과당 비용'(비용)
function hasRoasMarker(header: string): boolean {
  return /roas|수익률|지출\s*대비/.test(normalizeHeader(header));
}
function hasValueMarker(header: string): boolean {
  // 전환값 / 전환 가치 / conversion value / 구매값
  return /전환\s*값|전환\s*가치|conversion\s*value|구매\s*값/.test(normalizeHeader(header));
}
function hasCostMarker(header: string): boolean {
  // 결과당 비용 / 구매당 비용 / cost per purchase 등 (건수/매출/ROAS 아님)
  return /당\s*비용|cost\s*per|per\s*(purchase|result|conversion)/.test(normalizeHeader(header));
}
function hasIndicatorMarker(header: string): boolean {
  // 결과 표시 도구 / 결과 유형 / result indicator|type (건수 열과 구분)
  return /표시\s*도구|indicator|result\s*type|결과\s*유형|지표\s*이름/.test(normalizeHeader(header));
}

// 헤더 하나와 필드 하나의 매칭 점수
function scoreHeaderForField(header: string, field: CanonicalField): number {
  // ── 구매 계열 상호 오염 방지 (정확한 의미의 열만 허용) ──
  // 구매 건수(purchases): 값/수익률/비용 마커가 있으면 절대 아님. (건수 열만)
  if (field === "purchases" && (hasValueMarker(header) || hasRoasMarker(header) || hasCostMarker(header))) return 0;
  // 구매 매출(purchaseValue): 수익률/비용 마커가 있으면 절대 아님. (전환값 열만)
  if (field === "purchaseValue" && (hasRoasMarker(header) || hasCostMarker(header))) return 0;
  // 구매 ROAS(purchaseRoas): ROAS/수익률 마커가 없으면 절대 아님. (건수 열이 startsWith로 잘못 잡히는 것 방지)
  if (field === "purchaseRoas" && !hasRoasMarker(header)) return 0;
  // '결과'(resultCount): '결과당 비용/결과 ROAS/결과 전환값/결과 표시 도구'가 섞이지 않도록 차단.
  //   (오직 순수 '결과' 건수 열만 — startsWith 로 '결과당 비용' 등이 잡히는 것 방지)
  if (field === "resultCount" && (hasCostMarker(header) || hasRoasMarker(header) || hasValueMarker(header) || hasIndicatorMarker(header))) return 0;
  // '결과 표시 도구'(resultIndicator): 반드시 표시 도구/유형 마커가 있어야 하고, ROAS 표시 도구는 제외.
  if (field === "resultIndicator" && (!hasIndicatorMarker(header) || hasRoasMarker(header))) return 0;

  const nh = normalizeHeader(header);
  const ch = compact(header);
  let best = 0;
  for (const v of FIELD_BY_KEY[field].variants) {
    const nv = normalizeHeader(v);
    const cv = compact(v);
    let s = 0;
    if (nh === nv) s = 1;
    else if (ch === cv) s = 0.95;
    else if (nh.startsWith(nv) || nv.startsWith(nh)) s = 0.85;
    else if (nh.includes(nv)) s = 0.78;
    else if (ch.includes(cv)) s = 0.72;
    if (s > best) best = s;
  }
  return best;
}

export function emptyMapping(): Mapping {
  const m = {} as Mapping;
  for (const spec of FIELD_SPECS) m[spec.key] = { header: null, confidence: 0, auto: false };
  return m;
}

// 저장된 매핑에 이후 추가된 필드 키가 없을 수 있으므로 항상 전체 키를 보장한다.
export function normalizeMapping(m: Partial<Record<CanonicalField, FieldMapping>> | undefined): Mapping {
  const out = emptyMapping();
  if (m) for (const spec of FIELD_SPECS) {
    const v = m[spec.key];
    if (v && typeof v === "object") out[spec.key] = v;
  }
  return out;
}

// 자동 매핑 (그리디: 점수 높은 (필드,헤더) 쌍부터 배정, 헤더는 1회만 사용)
export function autoMap(headers: string[]): Mapping {
  const mapping = emptyMapping();
  const pairs: { field: CanonicalField; header: string; score: number }[] = [];
  for (const spec of FIELD_SPECS) {
    for (const header of headers) {
      const score = scoreHeaderForField(header, spec.key);
      if (score >= THRESHOLD) pairs.push({ field: spec.key, header, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score || a.field.localeCompare(b.field));
  const usedHeaders = new Set<string>();
  const assignedFields = new Set<CanonicalField>();
  for (const p of pairs) {
    if (assignedFields.has(p.field) || usedHeaders.has(p.header)) continue;
    mapping[p.field] = { header: p.header, confidence: p.score, auto: true };
    assignedFields.add(p.field);
    usedHeaders.add(p.header);
  }
  return mapping;
}

export function confidenceLabel(c: number): "높음" | "보통" | "낮음" | "-" {
  if (c <= 0) return "-";
  if (c >= 0.95) return "높음";
  if (c >= 0.8) return "보통";
  return "낮음";
}

// 필수 그룹 (하나 이상 매핑되면 충족)
// 광고 이름 또는 광고 ID 중 하나만 있으면 저장 가능.
// 성과 열(광고비/노출/도달 등)은 없어도 저장을 막지 않고 해당 지표만 '계산 불가'로 처리한다.
export const REQUIRED_GROUPS: { group: string; label: string; fields: CanonicalField[] }[] = [
  { group: "ad", label: "광고 이름/ID", fields: ["adName", "adId"] },
];

export interface MappingValidation {
  missingRequired: { group: string; label: string }[];
  duplicateHeaders: { header: string; fields: CanonicalField[] }[];
  presentPerfFields: PerfField[];
  ok: boolean; // 필수 충족 + 중복 없음
}

export function validateMapping(mapping: Mapping): MappingValidation {
  // 중복 헤더
  const headerToFields = new Map<string, CanonicalField[]>();
  for (const spec of FIELD_SPECS) {
    const h = mapping[spec.key]?.header;
    if (!h) continue;
    const arr = headerToFields.get(h) ?? [];
    arr.push(spec.key);
    headerToFields.set(h, arr);
  }
  const duplicateHeaders = [...headerToFields.entries()]
    .filter(([, fields]) => fields.length > 1)
    .map(([header, fields]) => ({ header, fields }));

  const missingRequired = REQUIRED_GROUPS.filter(
    (g) => !g.fields.some((f) => mapping[f]?.header),
  ).map((g) => ({ group: g.group, label: g.label }));

  const presentPerfFields = PERF_FIELDS.filter((f) => mapping[f]?.header);

  return {
    missingRequired,
    duplicateHeaders,
    presentPerfFields,
    ok: missingRequired.length === 0 && duplicateHeaders.length === 0,
  };
}
