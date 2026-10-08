// 포트폴리오 데모 저장 계층 — 브라우저 localStorage 사용 (서버/DB 없음).
// 입력·수정 내용은 이 브라우저에만 저장되며 다른 사용자와 공유되지 않는다.
// 최초 접속 시 샘플 데이터를 시드하고, '샘플 초기화'로 되돌릴 수 있다.

import type { Material, ProfitRecord } from "@/lib/materials/types";
import { sampleMaterials } from "@/lib/demo/sampleData";

const MATERIALS_KEY = "demo.materials.v1";
const PROFIT_KEY = "demo.profit.v1";
const ADSTATUS_KEY = "demo.adstatus.v1";

function canUse(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}
function read<T>(key: string, fallback: T): T {
  if (!canUse()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, val: unknown): void {
  if (!canUse()) return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    /* 용량 초과 등은 무시 (데모) */
  }
}

// 최초 1회만 샘플 시드. 이후(빈 배열 포함) 사용자가 비운 상태를 존중한다.
function ensureSeed(): Material[] {
  if (!canUse()) return sampleMaterials();
  try {
    const raw = localStorage.getItem(MATERIALS_KEY);
    if (raw === null) {
      const seed = sampleMaterials();
      write(MATERIALS_KEY, seed);
      return seed;
    }
    return JSON.parse(raw) as Material[];
  } catch {
    return [];
  }
}

export async function getAllMaterials(): Promise<Material[]> {
  return ensureSeed();
}

export async function putMaterial(m: Material): Promise<void> {
  const list = ensureSeed();
  const i = list.findIndex((x) => x.id === m.id);
  if (i >= 0) list[i] = m;
  else list.push(m);
  write(MATERIALS_KEY, list);
}

export async function deleteMaterial(id: string): Promise<void> {
  write(MATERIALS_KEY, ensureSeed().filter((x) => x.id !== id));
}

export async function clearMaterials(): Promise<void> {
  write(MATERIALS_KEY, []);
}

// ── 수익성 입력값 (BEP ROAS) ─────────────────────────────────
export async function getProfit(materialId: string): Promise<ProfitRecord | null> {
  const map = read<Record<string, ProfitRecord>>(PROFIT_KEY, {});
  return map[materialId] ?? null;
}
export async function putProfit(record: ProfitRecord): Promise<void> {
  const map = read<Record<string, ProfitRecord>>(PROFIT_KEY, {});
  map[record.id] = record;
  write(PROFIT_KEY, map);
}

// 브라우저 저장이므로 서버 저장 용량 개념 없음
export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  return null;
}

// ── 광고 운영 상태 ───────────────────────────────────────────
export async function getAllAdStatus(): Promise<Record<string, string>> {
  return read<Record<string, string>>(ADSTATUS_KEY, {});
}
export async function putAdStatus(key: string, status: string): Promise<void> {
  const map = read<Record<string, string>>(ADSTATUS_KEY, {});
  map[key] = status;
  write(ADSTATUS_KEY, map);
}

export interface BackupFile {
  app: "meta-ads-csv";
  version: 1;
  exportedAt: string;
  materials: Material[];
}

export function buildBackup(materials: Material[], exportedAt: string): BackupFile {
  return { app: "meta-ads-csv", version: 1, exportedAt, materials };
}

// 백업 복원 — localStorage에 병합(같은 id는 덮어씀)
export async function restoreBackup(json: unknown): Promise<number> {
  const bf = json as BackupFile;
  if (!bf || bf.app !== "meta-ads-csv" || !Array.isArray(bf.materials)) {
    throw new Error("백업 파일 형식이 올바르지 않습니다.");
  }
  const list = ensureSeed();
  for (const m of bf.materials) {
    const i = list.findIndex((x) => x.id === m.id);
    if (i >= 0) list[i] = m;
    else list.push(m);
  }
  write(MATERIALS_KEY, list);
  return bf.materials.length;
}

// 데모: 샘플 데이터로 초기화(재시드) + 입력값 비우기
export function resetSampleData(): void {
  write(MATERIALS_KEY, sampleMaterials());
  write(PROFIT_KEY, {});
  write(ADSTATUS_KEY, {});
}
