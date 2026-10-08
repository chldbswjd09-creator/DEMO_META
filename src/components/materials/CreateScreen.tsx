"use client";

import { useMaterials } from "@/components/providers/MaterialsProvider";
import { MappingEditor, isMappingValid } from "@/components/materials/MappingEditor";

export function CreateScreen() {
  const { draft, updateDraft, setDraftMapping, saveDraft, cancelDraft, error } = useMaterials();
  if (!draft) return null;
  const mappingOk = isMappingValid(draft.mapping);
  const canSave = draft.name.trim().length > 0 && mappingOk;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-5 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <h1 className="text-base font-bold text-slate-800">새 분석 자료 만들기</h1>
          <div className="flex gap-2">
            <button onClick={cancelDraft} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50">취소</button>
            <button
              onClick={saveDraft}
              disabled={!canSave}
              title={!draft.name.trim() ? "이름을 입력하세요" : !mappingOk ? "필수 열 매핑을 확인하세요" : ""}
              className="rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              분석 실행 및 저장
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-5">
        {error && <div className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

        <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-slate-600">분석 자료 이름 <span className="text-rose-500">*</span></label>
              <input
                value={draft.name}
                onChange={(e) => updateDraft({ name: e.target.value })}
                placeholder="예: 쥬스박스 8월 1주차 영상 소재"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">분석 기간 시작일</label>
              <input value={draft.periodStart} onChange={(e) => updateDraft({ periodStart: e.target.value })} placeholder="YYYY-MM-DD" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">분석 기간 종료일</label>
              <input value={draft.periodEnd} onChange={(e) => updateDraft({ periodEnd: e.target.value })} placeholder="YYYY-MM-DD" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            {(draft.autoStart || draft.autoEnd) && (
              <p className="text-[11px] text-slate-400 md:col-span-2">CSV의 보고 기간을 자동으로 가져왔습니다. 필요하면 직접 수정하세요.</p>
            )}
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">태그 (쉼표로 구분, 선택)</label>
              <input value={draft.tagsInput} onChange={(e) => updateDraft({ tagsInput: e.target.value })} placeholder="예: 쥬스박스, 영상" className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">메모 (선택)</label>
              <input value={draft.memo} onChange={(e) => updateDraft({ memo: e.target.value })} className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand" />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">파일: {draft.fileName} · {draft.rows.length.toLocaleString()}행 · 열 {draft.headers.length}개</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-bold text-slate-700">열 매핑 확인</h2>
          <p className="mb-3 text-[11px] text-slate-500">자동 매핑 결과입니다. 잘못 연결된 항목은 직접 바꾸세요. 필수 열은 <b>광고 이름 또는 광고 ID 중 하나</b>와 광고비·노출·도달입니다. 캠페인·광고세트·광고계정은 선택 사항이며, 구매·구매 매출 등 다른 열이 없으면 해당 지표만 “원본 열 없음”으로 표시됩니다.</p>
          <MappingEditor headers={draft.headers} mapping={draft.mapping} rows={draft.rows} onChange={setDraftMapping} />
        </section>
      </main>
    </div>
  );
}
