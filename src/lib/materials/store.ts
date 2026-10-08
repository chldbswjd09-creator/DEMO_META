// 클라이언트 저장 계층 — 서버 공용 저장소(API 라우트)를 호출한다.
// (로그인 없이 모든 기기/브라우저가 같은 데이터를 공유한다. 브라우저 로컬 저장 아님.)

import type { Material, ProfitRecord } from "@/lib/materials/types";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
  if (!res.ok) throw new Error(body.error || `요청 실패 (${res.status})`);
  return body as T;
}

export async function getAllMaterials(): Promise<Material[]> {
  const { materials } = await jsonFetch<{ materials: Material[] }>("/api/materials");
  return materials;
}

export async function putMaterial(m: Material): Promise<void> {
  await jsonFetch("/api/materials", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(m) });
}

export async function deleteMaterial(id: string): Promise<void> {
  await jsonFetch(`/api/materials?id=${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function clearMaterials(): Promise<void> {
  await jsonFetch("/api/materials?all=1", { method: "DELETE" });
}

// ── 수익성 입력값 ────────────────────────────────────────────
export async function getProfit(materialId: string): Promise<ProfitRecord | null> {
  const { record } = await jsonFetch<{ record: ProfitRecord | null }>(`/api/profit?id=${encodeURIComponent(materialId)}`);
  return record;
}

export async function putProfit(record: ProfitRecord): Promise<void> {
  await jsonFetch("/api/profit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(record) });
}

// 서버 저장이므로 브라우저 저장 용량 개념 없음
export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  return null;
}

// ── 광고 운영 상태 ───────────────────────────────────────────
export async function getAllAdStatus(): Promise<Record<string, string>> {
  const { statuses } = await jsonFetch<{ statuses: Record<string, string> }>("/api/adstatus");
  return statuses;
}

export async function putAdStatus(key: string, status: string): Promise<void> {
  await jsonFetch("/api/adstatus", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, status }) });
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

// 백업 복원 — 서버 공용 저장소에 병합(같은 id는 덮어씀)
export async function restoreBackup(json: unknown): Promise<number> {
  const bf = json as BackupFile;
  if (!bf || bf.app !== "meta-ads-csv" || !Array.isArray(bf.materials)) {
    throw new Error("백업 파일 형식이 올바르지 않습니다.");
  }
  for (const m of bf.materials) await putMaterial(m);
  return bf.materials.length;
}
