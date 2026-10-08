// 접근 제어 미들웨어 — 인증 쿠키가 유효하지 않으면
//  · 페이지 요청  → /login 으로 리다이렉트
//  · API 요청     → 401 Unauthorized
// (login 페이지, /api/auth/*, 정적 자산은 matcher에서 제외되어 항상 접근 가능)

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { AUTH_COOKIE, verifySession, authSecret } from "@/lib/server/auth";

export async function middleware(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  const ok = await verifySession(token, authSecret(), Date.now());
  if (ok) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

// 정적 자산·로그인 화면·인증 API는 인증 없이 접근 (그 외 모든 경로/‑API 보호)
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|login|api/auth/).*)"],
};
