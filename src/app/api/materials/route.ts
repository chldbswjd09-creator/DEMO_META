// 공용 분석 자료 API (로그인 없음 — 방문자 모두 공유)
import { NextResponse } from "next/server";
import type { Material } from "@/lib/materials/types";
import { listMaterials, saveMaterial, removeMaterial, clearAll } from "@/lib/server/store";
import { isAuthed } from "@/lib/server/authGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function unauth() {
  return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
}

export async function GET() {
  if (!(await isAuthed())) return unauth();
  try {
    const materials = await listMaterials();
    return NextResponse.json({ materials });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return unauth();
  try {
    const m = (await req.json()) as Material;
    if (!m || typeof m.id !== "string") return NextResponse.json({ error: "잘못된 자료" }, { status: 400 });
    await saveMaterial(m);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await isAuthed())) return unauth();
  try {
    const { searchParams } = new URL(req.url);
    if (searchParams.get("all") === "1") {
      await clearAll();
      return NextResponse.json({ ok: true });
    }
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
    await removeMaterial(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "서버 저장소 오류";
}
