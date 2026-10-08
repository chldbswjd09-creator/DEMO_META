// 탭 단위 로그인 상태(클라이언트) — sessionStorage 기반.
// sessionStorage 특성: 같은 탭의 새로고침·내부 이동에는 유지되고, 탭을 닫으면 자동 제거된다.
// → "사이트 탭 종료 시 다음 접속에 재로그인" + "새로고침은 로그아웃 아님"을 동시에 만족한다.
//
// 보안: 여기에 저장하는 값은 '이 탭이 로그인했는지' 확인용 비민감 값뿐이다.
//  - 비밀번호(APP_SHARED_PASSWORD) 저장 금지
//  - 서명 시크릿(AUTH_SECRET) 저장 금지
//  - 서버 인증은 별도의 HttpOnly 서명 쿠키가 담당(이 마커로 서버 권한이 생기지 않음)

export const TAB_KEY = "ma_tab";
export const DEFAULT_IDLE_MS = 3 * 60 * 60 * 1000; // 3시간

// 마지막 실제 활동 후 idle 판정(순수 함수 — 테스트 대상).
export function isIdle(lastActivityMs: number, nowMs: number, ttlMs: number): boolean {
  return nowMs - lastActivityMs >= ttlMs;
}

// 테스트/QA 에서 idle 시간을 짧게 조정할 수 있게 하는 오버라이드(비민감 — 시간 값일 뿐).
// NEXT_PUBLIC_IDLE_MS 는 비밀정보가 아니므로 클라이언트 노출이 허용된다(비밀번호/시크릿 아님).
export function idleMs(): number {
  const v = Number(process.env.NEXT_PUBLIC_IDLE_MS);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_IDLE_MS;
}

export interface TabSession {
  id: string; // 탭 식별용 임의 값(비민감)
  lastActivity: number; // 마지막 실제 활동 시각(ms)
}

// 저장된 마커 파싱(형식 불량/서버환경이면 null).
export function parseTabSession(raw: string | null | undefined): TabSession | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as Partial<TabSession>;
    if (typeof o.id === "string" && typeof o.lastActivity === "number") {
      return { id: o.id, lastActivity: o.lastActivity };
    }
  } catch {
    /* 형식 불량 → 없음 취급 */
  }
  return null;
}

// ── 브라우저 sessionStorage 접근(SSR 안전) ───────────────────────
function store(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null; // 접근 불가(프라이버시 모드 등)
  }
}

export function getTabSession(): TabSession | null {
  const s = store();
  return s ? parseTabSession(s.getItem(TAB_KEY)) : null;
}

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fallthrough */
  }
  return `t_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

// 로그인 성공 시 이 탭의 세션 마커 생성.
export function startTabSession(nowMs: number): void {
  const s = store();
  if (!s) return;
  const session: TabSession = { id: newId(), lastActivity: nowMs };
  s.setItem(TAB_KEY, JSON.stringify(session));
}

// 실제 활동 시 마지막 활동 시각 갱신(마커 없으면 아무 것도 안 함).
export function touchTabSession(nowMs: number): void {
  const s = store();
  if (!s) return;
  const cur = parseTabSession(s.getItem(TAB_KEY));
  if (!cur) return;
  s.setItem(TAB_KEY, JSON.stringify({ ...cur, lastActivity: nowMs }));
}

// 로그아웃/유휴 만료 시 이 탭의 세션 마커 제거.
export function clearTabSession(): void {
  const s = store();
  if (s) s.removeItem(TAB_KEY);
}
