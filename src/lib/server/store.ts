// 서버 공용 저장소 — API 라우트에서만 사용 (클라이언트 import 금지).
// 배포: Supabase(Postgres, 로그인 없음 — 서버가 REST로 단일 테이블 public.store 사용).
// 로컬 개발(환경변수 없음): 프로젝트 내 .data/store.json 파일.
// 로그인/인증 없이 모든 방문자가 같은 데이터를 읽고 쓰는 "공용 워크스페이스"다.

import { promises as fs } from "fs";
import path from "path";
import type { Material, ProfitRecord } from "@/lib/materials/types";

// 기존(구 인증 프로젝트) 변수명도 함께 허용해 재사용을 쉽게 한다.
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const useSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

const TABLE = "store"; // public.store (kind text, id text, data jsonb, pk(kind,id))

// ── Supabase REST (PostgREST) ────────────────────────────────
function supaHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: SUPABASE_KEY as string,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}
async function supaSelect(query: string): Promise<{ data: unknown }[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?${query}`, { headers: supaHeaders(), cache: "no-store" });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text().catch(() => "")}`);
  return (await res.json()) as { data: unknown }[];
}
async function supaUpsert(kind: string, id: string, data: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
    method: "POST",
    headers: supaHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ kind, id, data }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text().catch(() => "")}`);
}
async function supaDelete(query: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?${query}`, {
    method: "DELETE",
    headers: supaHeaders({ Prefer: "return=minimal" }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text().catch(() => "")}`);
}

// ── 로컬 파일 폴백 ────────────────────────────────────────────
const FILE = path.join(process.cwd(), ".data", "store.json");
interface FileShape {
  materials: Record<string, Material>;
  profit: Record<string, ProfitRecord>;
  adstatus?: Record<string, string>;
}
async function readFile(): Promise<FileShape> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as FileShape;
  } catch {
    return { materials: {}, profit: {} };
  }
}
async function writeFile(data: FileShape): Promise<void> {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(data), "utf8");
}

// ── 공개 API ─────────────────────────────────────────────────
export async function listMaterials(): Promise<Material[]> {
  let out: Material[];
  if (useSupabase) {
    const rows = await supaSelect("kind=eq.material&select=data");
    out = rows.map((r) => r.data as Material);
  } else {
    out = Object.values((await readFile()).materials);
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)); // 최신순
}

export async function saveMaterial(m: Material): Promise<void> {
  if (useSupabase) {
    await supaUpsert("material", m.id, m);
  } else {
    const data = await readFile();
    data.materials[m.id] = m;
    await writeFile(data);
  }
}

export async function removeMaterial(id: string): Promise<void> {
  if (useSupabase) {
    await supaDelete(`kind=eq.material&id=eq.${encodeURIComponent(id)}`);
    await supaDelete(`kind=eq.profit&id=eq.${encodeURIComponent(id)}`);
  } else {
    const data = await readFile();
    delete data.materials[id];
    delete data.profit[id];
    await writeFile(data);
  }
}

export async function clearAll(): Promise<void> {
  if (useSupabase) {
    await supaDelete("kind=eq.material");
    await supaDelete("kind=eq.profit");
  } else {
    await writeFile({ materials: {}, profit: {} });
  }
}

export async function getProfit(id: string): Promise<ProfitRecord | null> {
  if (useSupabase) {
    const rows = await supaSelect(`kind=eq.profit&id=eq.${encodeURIComponent(id)}&select=data&limit=1`);
    return rows.length ? (rows[0].data as ProfitRecord) : null;
  }
  return (await readFile()).profit[id] ?? null;
}

export async function saveProfit(record: ProfitRecord): Promise<void> {
  if (useSupabase) {
    await supaUpsert("profit", record.id, record);
  } else {
    const data = await readFile();
    data.profit[record.id] = record;
    await writeFile(data);
  }
}

// ── 광고 운영 상태 (kind='adstatus', id=광고키(mergeKey), data={key,status}) ──
export async function listAdStatus(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (useSupabase) {
    const rows = await supaSelect("kind=eq.adstatus&select=data");
    for (const r of rows) {
      const d = r.data as { key?: string; status?: string };
      if (d && d.key && d.status) out[d.key] = d.status;
    }
  } else {
    Object.assign(out, (await readFile()).adstatus ?? {});
  }
  return out;
}

export async function saveAdStatus(key: string, status: string): Promise<void> {
  if (useSupabase) {
    await supaUpsert("adstatus", key, { key, status });
  } else {
    const data = await readFile();
    data.adstatus = { ...(data.adstatus ?? {}), [key]: status };
    await writeFile(data);
  }
}

export function backend(): "supabase" | "file" {
  return useSupabase ? "supabase" : "file";
}
