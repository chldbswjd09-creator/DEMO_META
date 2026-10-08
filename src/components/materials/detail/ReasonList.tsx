"use client";

// ④ 판단 근거 — '왜 이런 판단이 나왔는가'를 짧게. 기존 판정 결과(reasons/advisory)를 그대로 렌더한다.
// 새로운 판정/문구 생성 로직을 만들지 않는다(표시 전용).

export function ReasonList({ reasons, caution }: { reasons: string[]; caution?: string | null }) {
  if (reasons.length === 0 && !caution) return null;
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="mb-1.5 text-xs font-bold text-slate-700">판단 근거</h3>
      <ul className="space-y-1">
        {reasons.map((r, i) => (
          <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-slate-600">
            <span className="text-brand" aria-hidden>·</span>
            <span>{r}</span>
          </li>
        ))}
      </ul>
      {caution && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-[11px] text-amber-700">주의: {caution}</p>}
    </section>
  );
}
