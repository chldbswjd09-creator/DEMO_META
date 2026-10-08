// 데이터 API 라우트용 인증 확인(Node 런타임). 미들웨어와 별개의 2차 방어선 —
// 미들웨어가 우회되더라도 인증 쿠키 없이는 데이터에 접근할 수 없게 한다.

import { cookies } from "next/headers";
import { AUTH_COOKIE, verifySession, authSecret } from "@/lib/server/auth";

export async function isAuthed(): Promise<boolean> {
  const token = cookies().get(AUTH_COOKIE)?.value;
  return verifySession(token, authSecret(), Date.now());
}
