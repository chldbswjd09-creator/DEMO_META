// 로그아웃 — 인증 쿠키 제거(데이터는 건드리지 않음).
import { NextResponse } from "next/server";
import { AUTH_COOKIE, isProd } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, "", {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: 0, // 즉시 만료
  });
  return res;
}
