// 공용 수익성(BEP ROAS) 입력값 API
import { NextResponse } from "next/server";
import type { ProfitRecord } from "@/lib/materials/types";
import { getProfit, saveProfit } from "@/lib/server/store";
import { isAuthed } from "@/lib/server/authGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function unauth() {
  return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
}

export async function GET(req: Request) {
  if (!(await isAuthed())) return unauth();
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
    const record = await getProfit(id);
    return NextResponse.json({ record });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return unauth();
  try {
    const record = (await req.json()) as ProfitRecord;
    if (!record || typeof record.id !== "string") return NextResponse.json({ error: "잘못된 값" }, { status: 400 });
    await saveProfit(record);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "서버 저장소 오류";
}
