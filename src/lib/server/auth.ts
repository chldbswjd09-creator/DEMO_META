// 공용 비밀번호 인증 — 서버 전용 검증 + 서명된 세션 토큰.
// Edge(middleware)와 Node(API 라우트) 양쪽에서 동작하도록 Web Crypto만 사용한다.
// 비밀번호/시크릿은 코드에 두지 않고 서버 환경변수에서만 읽는다(클라이언트 노출 금지).

export const AUTH_COOKIE = "ma_session";

// 세션은 '절대 만료(7일)'가 아니라 '마지막 활동 후 idle 만료' 방식이다.
// 실제 사용자 활동이 있을 때만 클라이언트가 /api/auth/refresh 로 쿠키 exp 를 갱신(슬라이딩)한다.
// 활동이 3시간 없으면 쿠키가 자연 만료되어 서버 세션이 종료된다(polling/heartbeat 로는 갱신하지 않음).
export const DEFAULT_IDLE_TTL_S = 3 * 60 * 60; // 3시간

// 테스트/운영에서 idle 시간을 조정할 수 있게 서버 환경변수로 오버라이드(비민감 — 시간 값일 뿐).
// AUTH_IDLE_SECONDS 를 짧게 주면 3시간을 기다리지 않고 만료 동작을 확인할 수 있다.
export function idleTtlS(): number {
  const v = Number(process.env.AUTH_IDLE_SECONDS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_IDLE_TTL_S;
}

// ── base64url ────────────────────────────────────────────────
function bytesToB64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function strToB64url(str: string): string {
  return bytesToB64url(new TextEncoder().encode(str));
}
function b64urlToStr(b64: string): string {
  const s = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = s + "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// ── HMAC-SHA256 (서명) ───────────────────────────────────────
async function hmacB64url(data: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return bytesToB64url(new Uint8Array(sig));
}

// 길이가 같을 때 상수시간 비교(타이밍 공격 완화)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ── 세션 토큰: base64url(payload).hmac(payload) ───────────────
export async function createSession(secret: string, nowMs: number, ttlS: number = idleTtlS()): Promise<string> {
  const payload = strToB64url(JSON.stringify({ exp: nowMs + ttlS * 1000 }));
  const sig = await hmacB64url(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifySession(token: string | undefined | null, secret: string, nowMs: number): Promise<boolean> {
  if (!token || !secret) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacB64url(payload, secret);
  if (!timingSafeEqual(sig, expected)) return false; // 서명 위조 방지
  try {
    const obj = JSON.parse(b64urlToStr(payload)) as { exp?: number };
    return typeof obj.exp === "number" && obj.exp > nowMs; // 만료 확인
  } catch {
    return false;
  }
}

// ── 비밀번호 검증(상수시간) ──────────────────────────────────
export function checkPassword(input: string, expected: string | undefined): boolean {
  if (!expected) return false; // 서버에 비밀번호 미설정 → 아무도 통과 못 함
  return timingSafeEqual(input, expected);
}

// ── 서버 환경변수 (클라이언트 노출 금지) ─────────────────────
export function authSecret(): string {
  return process.env.AUTH_SECRET ?? "";
}
export function sharedPassword(): string | undefined {
  return process.env.APP_SHARED_PASSWORD;
}
export function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}
