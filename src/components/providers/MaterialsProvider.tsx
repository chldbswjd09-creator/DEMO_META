"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisSettings } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/verdict/settings";
import { parseFile } from "@/lib/csv/parse";
import { autoMap, type Mapping } from "@/lib/csv/mapping";
import type { Draft, Material } from "@/lib/materials/types";
import {
  buildBackup,
  clearMaterials,
  deleteMaterial,
  estimateStorage,
  getAllMaterials,
  putMaterial,
  restoreBackup,
} from "@/lib/materials/store";

export type View = "library" | "create" | "detail" | "aggregate" | "compare" | "integrated" | "period";

interface MaterialsState {
  loaded: boolean;
  materials: Material[];
  view: View;
  draft: Draft | null;
  detailId: string | null;
  selected: string[];
  busy: boolean;
  progress: string | null;
  error: string | null;
  storage: { usage: number; quota: number } | null;
  settings: AnalysisSettings;
}

interface MaterialsContextValue extends MaterialsState {
  startUpload: (files: FileList | File[]) => Promise<void>;
  updateDraft: (patch: Partial<Draft>) => void;
  setDraftMapping: (m: Mapping) => void;
  cancelDraft: () => void;
  saveDraft: () => Promise<void>;
  openDetail: (id: string) => void;
  backToLibrary: () => void;
  rename: (id: string, name: string) => Promise<void>;
  updateMeta: (id: string, patch: Partial<Pick<Material, "tags" | "memo" | "periodStart" | "periodEnd" | "name" | "manualCampaignName">>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  clearAll: () => Promise<void>;
  toggleSelect: (id: string) => void;
  selectMany: (ids: string[], on: boolean) => void;
  clearSelection: () => void;
  goSelectionView: (v: "aggregate" | "compare" | "integrated" | "period") => void;
  backup: () => void;
  restore: (json: unknown) => Promise<void>;
}

const MaterialsContext = createContext<MaterialsContextValue | null>(null);

export function useMaterials(): MaterialsContextValue {
  const ctx = useContext(MaterialsContext);
  if (!ctx) throw new Error("useMaterials must be used within MaterialsProvider");
  return ctx;
}

function detectPeriod(rows: Record<string, string>[], mapping: Mapping): { start?: string; end?: string } {
  const rs = mapping.reportStart.header;
  const re = mapping.reportEnd.header;
  const dt = mapping.date.header;
  let start: string | undefined;
  let end: string | undefined;
  for (const r of rows) {
    if (rs && r[rs]) start = start && start < r[rs] ? start : r[rs];
    if (re && r[re]) end = end && end > r[re] ? end : r[re];
    if (!rs && dt && r[dt]) { const v = r[dt]; if (!start || v < start) start = v; if (!end || v > end) end = v; }
  }
  return { start, end };
}

function stripExt(name: string): string {
  return name.replace(/\.(csv|tsv|txt)$/i, "");
}

// 공용 저장소 저장 실패 메시지 — 저장된 것처럼 오인시키지 않는다.
function saveFailMsg(e: unknown): string {
  const detail = e instanceof Error ? e.message : "";
  return `공용 저장소 저장에 실패했습니다. 자료가 저장되지 않았습니다. 네트워크 상태를 확인한 뒤 다시 시도해주세요.${detail ? ` (${detail})` : ""}`;
}
function updateFailMsg(e: unknown): string {
  const detail = e instanceof Error ? e.message : "";
  return `공용 저장소 반영에 실패했습니다. 변경 내용이 저장되지 않았습니다. 다시 시도해주세요.${detail ? ` (${detail})` : ""}`;
}

export function MaterialsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<MaterialsState>({
    loaded: false,
    materials: [],
    view: "library",
    draft: null,
    detailId: null,
    selected: [],
    busy: false,
    progress: null,
    error: null,
    storage: null,
    settings: DEFAULT_SETTINGS,
  });

  const refresh = useCallback(async () => {
    try {
      const [materials, storage] = await Promise.all([getAllMaterials(), estimateStorage()]);
      setState((s) => ({ ...s, materials, storage, loaded: true }));
    } catch (e) {
      setState((s) => ({ ...s, loaded: true, error: e instanceof Error ? e.message : "저장소를 불러오지 못했습니다." }));
    }
  }, []);

  // 최신 상태 접근용 ref (setState 콜백에 의존하지 않고 draft 등을 읽기 위함)
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    refresh();
  }, [refresh]);

  const startUpload = useCallback(async (files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file) return;
    setState((s) => ({ ...s, busy: true, progress: `파일 처리 중 — ${file.name}`, error: null }));
    try {
      const parsed = await parseFile(file);
      const mapping = autoMap(parsed.headers);
      const period = detectPeriod(parsed.rows, mapping);
      const draft: Draft = {
        fileName: parsed.fileName,
        fileSize: parsed.fileSize,
        encoding: parsed.encoding,
        delimiter: parsed.delimiter,
        headers: parsed.headers,
        rows: parsed.rows,
        mapping,
        name: stripExt(parsed.fileName),
        periodStart: period.start ?? "",
        periodEnd: period.end ?? "",
        tagsInput: "",
        memo: "",
        autoStart: period.start,
        autoEnd: period.end,
      };
      setState((s) => ({ ...s, draft, view: "create", busy: false, progress: null }));
    } catch {
      setState((s) => ({ ...s, busy: false, progress: null, error: `${file.name} 파일을 읽지 못했습니다.` }));
    }
  }, []);

  const updateDraft = useCallback((patch: Partial<Draft>) => setState((s) => (s.draft ? { ...s, draft: { ...s.draft, ...patch } } : s)), []);
  const setDraftMapping = useCallback((m: Mapping) => setState((s) => (s.draft ? { ...s, draft: { ...s.draft, mapping: m } } : s)), []);
  const cancelDraft = useCallback(() => setState((s) => ({ ...s, draft: null, view: "library", error: null })), []);

  const saveDraft = useCallback(async () => {
    const d = stateRef.current.draft;
    if (!d) return;
    if (!d.name.trim()) {
      setState((s) => ({ ...s, error: "분석 자료 이름을 입력하세요." }));
      return;
    }
    const created: Material = {
      id: crypto.randomUUID(),
      name: d.name.trim(),
      tags: d.tagsInput.split(",").map((t) => t.trim()).filter(Boolean),
      memo: d.memo,
      periodStart: d.periodStart || undefined,
      periodEnd: d.periodEnd || undefined,
      createdAt: new Date().toISOString(),
      file: { name: d.fileName, size: d.fileSize, encoding: d.encoding, delimiter: d.delimiter },
      headers: d.headers,
      rows: d.rows,
      mapping: d.mapping,
    };
    setState((s) => ({ ...s, busy: true, progress: "공용 저장소에 저장 중…", error: null }));
    try {
      await putMaterial(created);
    } catch (e) {
      // 공용 저장 실패 → 정상 저장된 것처럼 보여주지 않는다(로컬 임시 저장도 하지 않음).
      setState((s) => ({ ...s, busy: false, progress: null, error: saveFailMsg(e) }));
      return;
    }
    setState((s) => ({ ...s, draft: null, view: "library", busy: false, progress: null, error: null }));
    await refresh();
  }, [refresh]);

  const openDetail = useCallback((id: string) => setState((s) => ({ ...s, view: "detail", detailId: id })), []);
  const backToLibrary = useCallback(() => setState((s) => ({ ...s, view: "library", detailId: null })), []);

  const rename = useCallback(async (id: string, name: string) => {
    const m = state.materials.find((x) => x.id === id);
    if (!m || !name.trim()) return;
    try {
      await putMaterial({ ...m, name: name.trim() });
    } catch (e) {
      setState((s) => ({ ...s, error: updateFailMsg(e) }));
      return;
    }
    await refresh();
  }, [state.materials, refresh]);

  const updateMeta = useCallback(async (id: string, patch: Partial<Material>) => {
    const m = state.materials.find((x) => x.id === id);
    if (!m) return;
    try {
      await putMaterial({ ...m, ...patch });
    } catch (e) {
      setState((s) => ({ ...s, error: updateFailMsg(e) }));
      return;
    }
    await refresh();
  }, [state.materials, refresh]);

  const remove = useCallback(async (id: string) => {
    try {
      await deleteMaterial(id);
    } catch (e) {
      setState((s) => ({ ...s, error: updateFailMsg(e) }));
      return;
    }
    setState((s) => ({ ...s, selected: s.selected.filter((x) => x !== id) }));
    await refresh();
  }, [refresh]);

  const clearAll = useCallback(async () => {
    try {
      await clearMaterials();
    } catch (e) {
      setState((s) => ({ ...s, error: updateFailMsg(e) }));
      return;
    }
    setState((s) => ({ ...s, selected: [] }));
    await refresh();
  }, [refresh]);

  const toggleSelect = useCallback((id: string) => setState((s) => ({
    ...s,
    selected: s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id],
  })), []);
  const selectMany = useCallback((ids: string[], on: boolean) => setState((s) => {
    const set = new Set(s.selected);
    if (on) ids.forEach((id) => set.add(id));
    else ids.forEach((id) => set.delete(id));
    return { ...s, selected: [...set] };
  }), []);
  const clearSelection = useCallback(() => setState((s) => ({ ...s, selected: [], view: "library" })), []);
  const goSelectionView = useCallback((v: "aggregate" | "compare" | "integrated" | "period") => setState((s) => ({ ...s, view: v })), []);

  const backup = useCallback(() => {
    const bf = buildBackup(state.materials, new Date().toISOString());
    const blob = new Blob([JSON.stringify(bf)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "meta-ads-분석자료-백업.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [state.materials]);

  const restore = useCallback(async (json: unknown) => {
    try {
      await restoreBackup(json);
      await refresh();
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : "복원 실패" }));
    }
  }, [refresh]);

  const value = useMemo<MaterialsContextValue>(() => ({
    ...state,
    startUpload, updateDraft, setDraftMapping, cancelDraft, saveDraft,
    openDetail, backToLibrary, rename, updateMeta, remove, clearAll,
    toggleSelect, selectMany, clearSelection, goSelectionView, backup, restore,
  }), [state, startUpload, updateDraft, setDraftMapping, cancelDraft, saveDraft, openDetail, backToLibrary, rename, updateMeta, remove, clearAll, toggleSelect, selectMany, clearSelection, goSelectionView, backup, restore]);

  return <MaterialsContext.Provider value={value}>{children}</MaterialsContext.Provider>;
}
