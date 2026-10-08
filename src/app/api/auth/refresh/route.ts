// 세션 슬라이딩 갱신 — 클라이언트가 '실제 사용자 활동'이 있을 때만(스로틀) 호출한다.
// polling/heartbeat/자동 refresh 로는 호출하지 않는다(마지막 활동 후 idle 만료를 유지하기 위함).
//
// 유효한 인증 쿠키가 있을 때만 새 exp(=now + idle TTL)로 재발급한다.
// 쿠키가 이미 만료/위조면 401 — 서버 인증 구조(HttpOnly·서명·만료)는 그대로 유지한다.
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE, idleTtlS, createSession, verifySession, authSecret, isProd } from "@/lib/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const secret = authSecret();
  const token = cookies().get(AUTH_COOKIE)?.value;
  if (!(await verifySession(token, secret, Date.now()))) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }
  const ttl = idleTtlS();
  const fresh = await createSession(secret, Date.now(), ttl);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, fresh, {
    httpOnly: true,
    secure: isProd(),
    sameSite: "lax",
    path: "/",
    maxAge: ttl,
  });
  return res;
}
