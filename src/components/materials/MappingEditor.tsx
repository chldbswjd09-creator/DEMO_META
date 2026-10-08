"use client";

import { FIELD_SPECS, type CanonicalField } from "@/lib/csv/columnMap";
import { confidenceLabel, validateMapping, REQUIRED_GROUPS, type Mapping } from "@/lib/csv/mapping";
import { cn } from "@/lib/cn";

export function MappingEditor({
  headers,
  mapping,
  rows,
  onChange,
}: {
  headers: string[];
  mapping: Mapping;
  rows: Record<string, string>[];
  onChange: (m: Mapping) => void;
}) {
  const validation = validateMapping(mapping);
  const dupHeaders = new Set(validation.duplicateHeaders.map((d) => d.header));

  const sampleFor = (header: string | null): string => {
    if (!header) return "";
    for (const r of rows) {
      const v = r[header];
      if (v != null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };

  const setField = (field: CanonicalField, header: string) =>
    onChange({ ...mapping, [field]: { header: header || null, confidence: header ? 1 : 0, auto: false } });

  const requiredMet = (field: CanonicalField) => REQUIRED_GROUPS.some((g) => g.fields.includes(field));

  const row = (fieldKey: CanonicalField) => {
    const spec = FIELD_SPECS.find((f) => f.key === fieldKey)!;
    const fm = mapping[fieldKey];
    const isDup = fm.header ? dupHeaders.has(fm.header) : false;
    return (
      <tr key={fieldKey} className="border-b border-slate-100">
        <td className="py-1.5 pr-2">
          <span className="text-xs font-medium text-slate-700">{spec.label}</span>
          {requiredMet(fieldKey) && <span className="ml-1 text-[10px] text-rose-500">필수*</span>}
        </td>
        <td className="py-1.5 pr-2">
          <select
            value={fm.header ?? ""}
            onChange={(e) => setField(fieldKey, e.target.value)}
            className={cn("w-full rounded-md border px-2 py-1 text-xs", isDup ? "border-rose-300 bg-rose-50" : "border-slate-300")}
          >
            <option value="">(매핑 안 함)</option>
            {headers.map((h) => (<option key={h} value={h}>{h}</option>))}
          </select>
        </td>
        <td className="py-1.5 pr-2 text-center">
          <span className={cn("rounded px-1.5 py-0.5 text-[10px]", fm.confidence >= 0.95 ? "bg-emerald-50 text-emerald-700" : fm.confidence >= 0.8 ? "bg-amber-50 text-amber-700" : fm.header ? "bg-slate-100 text-slate-500" : "text-slate-300")}>
            {confidenceLabel(fm.confidence)}
          </span>
        </td>
        <td className="max-w-[150px] py-1.5 pr-2"><span className="clamp-1 text-[11px] text-slate-400" title={sampleFor(fm.header)}>{sampleFor(fm.header) || "—"}</span></td>
      </tr>
    );
  };

  const noAdId = !mapping.adId.header && !!mapping.adName.header;

  const idFields = FIELD_SPECS.filter((f) => f.kind === "id");
  const perfFields = FIELD_SPECS.filter((f) => f.kind === "perf");
  const head = (
    <thead>
      <tr className="border-b border-slate-200 text-left text-[10px] text-slate-400">
        <th className="py-1 font-medium">필요한 항목</th>
        <th className="py-1 font-medium">CSV 열</th>
        <th className="py-1 text-center font-medium">신뢰도</th>
        <th className="py-1 font-medium">샘플</th>
      </tr>
    </thead>
  );

  return (
    <div>
      {(validation.missingRequired.length > 0 || validation.duplicateHeaders.length > 0) && (
        <div className="mb-2 space-y-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {validation.missingRequired.length > 0 && <p>누락된 필수 열: {validation.missingRequired.map((m) => m.label).join(", ")}</p>}
          {validation.duplicateHeaders.map((d) => (<p key={d.header}>중복 연결: “{d.header}”</p>))}
        </div>
      )}
      {noAdId && (
        <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          광고 ID가 없어 광고 이름으로 매칭합니다. 분석은 가능하지만, 여러 자료를 합산할 때 동일 광고 중복 검사 정확도가 낮아질 수 있습니다.
        </div>
      )}
      <h4 className="mb-1 text-xs font-bold text-slate-600">식별 열</h4>
      <table className="w-full">{head}<tbody>{idFields.map((f) => row(f.key))}</tbody></table>
      <h4 className="mb-1 mt-3 text-xs font-bold text-slate-600">성과 열</h4>
      <table className="w-full">{head}<tbody>{perfFields.map((f) => row(f.key))}</tbody></table>
    </div>
  );
}

export function isMappingValid(mapping: Mapping): boolean {
  const v = validateMapping(mapping);
  return v.missingRequired.length === 0 && v.duplicateHeaders.length === 0;
}
