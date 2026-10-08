// 공용 비밀번호 로그인 — 서버에서만 검증하고 서명된 HttpOnly 세션 쿠키를 발급한다.
import { NextResponse } from "next/server";
import { AUTH_COOKIE, idleTtlS, createSession, checkPassword, authSecret, sharedPassword, isProd } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = authSecret();
  const expected = sharedPassword();
  if (!secret || !expected) {
    // 서버에 APP_SHARED_PASSWORD / AUTH_SECRET 미설정 → 인증 자체가 불가(아무도 통과 못 함)
    return NextResponse.json({ error: "서버 인증 설정이 완료되지 않았습니다. 관리자에게 문의하세요." }, { status: 500 });
  }
  let password = "";
  try {
    const body = (await req.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    password = "";
  }
  if (!checkPassword(password, expected)) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const ttl = idleTtlS();
  const token = await createSession(secret, Date.now(), ttl);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: ttl, // idle 만료(활동 시 /api/auth/refresh 로 슬라이딩)
  });
  return res;
}
