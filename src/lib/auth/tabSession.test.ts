import { describe, it, expect, afterEach } from "vitest";
import { isIdle, idleMs, parseTabSession, DEFAULT_IDLE_MS, TAB_KEY } from "@/lib/auth/tabSession";

const NOW = 1_700_000_000_000;

describe("idle 판정(isIdle)", () => {
  const TTL = 3 * 60 * 60 * 1000; // 3시간

  it("마지막 활동 후 TTL 미만이면 유휴 아님(로그인 유지)", () => {
    expect(isIdle(NOW, NOW, TTL)).toBe(false); // 방금 활동
    expect(isIdle(NOW, NOW + TTL - 1, TTL)).toBe(false); // 3시간 직전
  });

  it("마지막 활동 후 TTL 이상이면 유휴(로그아웃 대상)", () => {
    expect(isIdle(NOW, NOW + TTL, TTL)).toBe(true); // 정확히 3시간
    expect(isIdle(NOW, NOW + TTL + 1, TTL)).toBe(true); // 3시간 경과
  });

  it("짧은 TTL 로 3시간을 기다리지 않고 만료를 검증할 수 있다(테스트 가능 구조)", () => {
    const SHORT = 10_000; // 10초
    expect(isIdle(NOW, NOW + 9_999, SHORT)).toBe(false);
    expect(isIdle(NOW, NOW + 10_000, SHORT)).toBe(true);
  });
});

describe("idleMs 환경변수 오버라이드", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_IDLE_MS;
  });

  it("미설정이면 기본 3시간", () => {
    expect(idleMs()).toBe(DEFAULT_IDLE_MS);
    expect(DEFAULT_IDLE_MS).toBe(3 * 60 * 60 * 1000);
  });

  it("양수 값이면 오버라이드, 잘못된 값이면 기본값", () => {
    process.env.NEXT_PUBLIC_IDLE_MS = "5000";
    expect(idleMs()).toBe(5000);
    process.env.NEXT_PUBLIC_IDLE_MS = "0";
    expect(idleMs()).toBe(DEFAULT_IDLE_MS);
    process.env.NEXT_PUBLIC_IDLE_MS = "abc";
    expect(idleMs()).toBe(DEFAULT_IDLE_MS);
  });
});

describe("탭 세션 마커 파싱(parseTabSession)", () => {
  it("정상 JSON 은 파싱, 형식 불량/빈 값은 null", () => {
    expect(parseTabSession(JSON.stringify({ id: "abc", lastActivity: NOW }))).toEqual({ id: "abc", lastActivity: NOW });
    expect(parseTabSession(null)).toBeNull();
    expect(parseTabSession("")).toBeNull();
    expect(parseTabSession("not-json")).toBeNull();
    expect(parseTabSession(JSON.stringify({ id: "abc" }))).toBeNull(); // lastActivity 없음
    expect(parseTabSession(JSON.stringify({ lastActivity: NOW }))).toBeNull(); // id 없음
  });

  it("마커에는 비밀번호/시크릿이 아니라 비민감 값(id·시각)만 담긴다", () => {
    // 마커 키/구조가 인증 비밀정보를 포함하지 않음을 문서화(회귀 방지).
    const parsed = parseTabSession(JSON.stringify({ id: "abc", lastActivity: NOW }));
    expect(TAB_KEY).toBe("ma_tab");
    expect(Object.keys(parsed ?? {})).toEqual(["id", "lastActivity"]);
  });
});
