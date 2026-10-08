import { describe, it, expect } from "vitest";
import { createSession, verifySession, checkPassword, DEFAULT_IDLE_TTL_S } from "@/lib/server/auth";

const SECRET = "unit-test-secret-abcdef0123456789";
const NOW = 1_700_000_000_000; // 고정 시각(테스트 결정성)

describe("세션 토큰 서명/검증", () => {
  it("정상 세션은 검증 통과", async () => {
    const t = await createSession(SECRET, NOW);
    expect(await verifySession(t, SECRET, NOW)).toBe(true);
    expect(await verifySession(t, SECRET, NOW + 1000)).toBe(true); // 만료 전
  });

  it("잘못된 시크릿으로는 통과 못 함", async () => {
    const t = await createSession(SECRET, NOW);
    expect(await verifySession(t, "다른-시크릿", NOW)).toBe(false);
  });

  it("payload 위조 시 서명 불일치로 거부", async () => {
    const t = await createSession(SECRET, NOW);
    const [, sig] = t.split(".");
    // exp를 아주 먼 미래로 바꿔치기한 위조 토큰
    const forgedPayload = btoa(JSON.stringify({ exp: NOW + 10 ** 12 })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const forged = `${forgedPayload}.${sig}`;
    expect(await verifySession(forged, SECRET, NOW)).toBe(false);
  });

  it("서명 없는 임의 쿠키(auth=true 등)는 거부", async () => {
    expect(await verifySession("true", SECRET, NOW)).toBe(false);
    expect(await verifySession("auth=true", SECRET, NOW)).toBe(false);
    expect(await verifySession("", SECRET, NOW)).toBe(false);
    expect(await verifySession(undefined, SECRET, NOW)).toBe(false);
  });

  it("만료된 세션은 거부", async () => {
    const t = await createSession(SECRET, NOW, DEFAULT_IDLE_TTL_S);
    const afterExpiry = NOW + DEFAULT_IDLE_TTL_S * 1000 + 1;
    expect(await verifySession(t, SECRET, afterExpiry)).toBe(false);
  });

  it("기본 idle TTL 은 3시간(절대 7일 만료 제거됨)", async () => {
    expect(DEFAULT_IDLE_TTL_S).toBe(3 * 60 * 60);
    const t = await createSession(SECRET, NOW, DEFAULT_IDLE_TTL_S);
    // 3시간 직전엔 유효, 3시간 경과 후엔 만료
    expect(await verifySession(t, SECRET, NOW + DEFAULT_IDLE_TTL_S * 1000 - 1)).toBe(true);
    expect(await verifySession(t, SECRET, NOW + DEFAULT_IDLE_TTL_S * 1000 + 1)).toBe(false);
  });

  it("슬라이딩: 활동 시 재발급하면 새 exp 로 만료가 연장된다", async () => {
    const first = await createSession(SECRET, NOW, DEFAULT_IDLE_TTL_S);
    // 2시간 뒤 활동 → 재발급(그 시점 기준 3시간)
    const activityAt = NOW + 2 * 60 * 60 * 1000;
    const renewed = await createSession(SECRET, activityAt, DEFAULT_IDLE_TTL_S);
    // 최초 토큰은 3시간에 만료되지만, 재발급 토큰은 활동시각+3시간까지 유효
    const at = NOW + 4 * 60 * 60 * 1000; // 최초 기준 4시간(만료), 활동 기준 2시간(유효)
    expect(await verifySession(first, SECRET, at)).toBe(false);
    expect(await verifySession(renewed, SECRET, at)).toBe(true);
  });

  it("시크릿 미설정(빈 문자열)이면 항상 거부", async () => {
    const t = await createSession(SECRET, NOW);
    expect(await verifySession(t, "", NOW)).toBe(false);
  });
});

describe("공용 비밀번호 검증", () => {
  it("일치하면 true, 불일치/빈 값이면 false", () => {
    expect(checkPassword("hunter2", "hunter2")).toBe(true);
    expect(checkPassword("wrong", "hunter2")).toBe(false);
    expect(checkPassword("", "hunter2")).toBe(false);
    expect(checkPassword("hunter2", "hunter22")).toBe(false); // 길이 다름
  });
  it("서버 비밀번호 미설정이면 아무 입력도 통과 못 함", () => {
    expect(checkPassword("anything", undefined)).toBe(false);
    expect(checkPassword("", undefined)).toBe(false);
  });
});
