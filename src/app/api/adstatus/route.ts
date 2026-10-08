// 공용 광고 운영 상태 API (로그인 없음 — 방문자 공유). key = 광고 ID 우선, 없으면 정규화 이름.
import { NextResponse } from "next/server";
import { listAdStatus, saveAdStatus } from "@/lib/server/store";
import { isAuthed } from "@/lib/server/authGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function unauth() {
  return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
}

export async function GET() {
  if (!(await isAuthed())) return unauth();
  try {
    const statuses = await listAdStatus();
    return NextResponse.json({ statuses });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return unauth();
  try {
    const { key, status } = (await req.json()) as { key?: string; status?: string };
    if (!key || !status) return NextResponse.json({ error: "key/status 필요" }, { status: 400 });
    await saveAdStatus(key, status);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: msg(e) }, { status: 500 });
  }
}

function msg(e: unknown): string {
  return e instanceof Error ? e.message : "서버 저장소 오류";
}
