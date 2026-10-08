"use client";

// 탭 단위 로그인 게이트 + 유휴(idle) 자동 로그아웃 + 활동 기반 세션 슬라이딩.
//
// 동작 요약
//  · 탭 세션(sessionStorage) 없음        → 로그인 화면 요구(쿠키는 건드리지 않음 → 다른 탭 보호)
//  · 탭 세션 있음 + 유휴 아님            → 대시보드 렌더 + 실제 활동 추적
//  · 새로고침/내부 이동                  → sessionStorage 유지 → 로그인 유지
//  · 마지막 실제 활동 후 idleMs 경과     → 탭 세션 제거 + 로그인 이동
//  · 실제 활동(스로틀) 시                → /api/auth/refresh 로 서버 쿠키 exp 슬라이딩
//
// beforeunload/unload 신호에는 의존하지 않는다(탭 종료 이벤트는 보장되지 않음).
// 탭을 닫으면 브라우저가 sessionStorage 를 자동 제거하므로, 다음 접속(새 탭)에서 재로그인이 요구된다.

import { useEffect, useRef, useState } from "react";
import { clearTabSession, getTabSession, idleMs, isIdle, touchTabSession } from "@/lib/auth/tabSession";

type Status = "checking" | "authed";

function goLogin(): void {
  // 히스토리에 남기지 않고 로그인 화면으로 이동.
  window.location.replace("/login");
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const redirectingRef = useRef(false);
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    const ttl = idleMs();

    const redirect = () => {
      if (redirectingRef.current) return;
      redirectingRef.current = true;
      clearTabSession(); // 이 탭의 로그인 상태만 제거(공유 쿠키는 건드리지 않음)
      goLogin();
    };

    // ── 초기 게이트: 탭 세션 유무/유휴 판정 ──────────────────────
    const session = getTabSession();
    if (!session) {
      // 이 탭은 로그인한 적이 없음(새 탭/탭 종료 후 재접속) → 로그인 요구.
      redirect();
      return;
    }
    if (isIdle(session.lastActivity, Date.now(), ttl)) {
      redirect();
      return;
    }
    // 게이트 통과: 도착(사용자가 이 페이지를 연 것) 자체를 활동으로 인정.
    touchTabSession(Date.now());
    setStatus("authed");

    // ── 세션 슬라이딩(실제 활동 시에만, 스로틀) ────────────────
    const refreshInterval = Math.max(1000, Math.min(5 * 60 * 1000, Math.floor(ttl / 3)));
    const slide = () => {
      const now = Date.now();
      if (now - lastRefreshRef.current < refreshInterval) return; // 스로틀(과도한 호출 방지)
      lastRefreshRef.current = now;
      fetch("/api/auth/refresh", { method: "POST" })
        .then((res) => {
          // 서버 세션이 이미 종료됨(다른 탭 수동 로그아웃/만료) → 이 탭도 로그인 이동.
          if (res.status === 401) redirect();
        })
        .catch(() => {
          /* 네트워크 일시 오류는 무시(다음 활동에서 재시도) */
        });
    };
    slide(); // 진입 직후 1회(쿠키를 현재 활동 기준으로 갱신)

    // ── 실제 사용자 활동 이벤트 ────────────────────────────────
    // background API/polling/heartbeat 는 여기서 제외된다(진짜 입력 이벤트만 구독).
    const onActivity = () => {
      if (redirectingRef.current) return;
      touchTabSession(Date.now());
      slide();
    };
    const events = ["pointerdown", "keydown", "scroll", "wheel", "touchstart", "click"];
    for (const ev of events) window.addEventListener(ev, onActivity, { passive: true });

    // ── 유휴 감시 타이머 ───────────────────────────────────────
    const checkEvery = Math.max(1000, Math.min(30 * 1000, Math.floor(ttl / 4)));
    const timer = window.setInterval(() => {
      if (redirectingRef.current) return;
      const cur = getTabSession();
      if (!cur || isIdle(cur.lastActivity, Date.now(), ttl)) redirect();
    }, checkEvery);

    return () => {
      for (const ev of events) window.removeEventListener(ev, onActivity);
      window.clearInterval(timer);
    };
    // 마운트 시 1회만 설정(의존성 없음).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status !== "authed") {
    // 게이트 확인 중에는 데이터(/api/materials 등)를 로드하지 않는다.
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-400">확인 중…</p>
      </div>
    );
  }
  return <>{children}</>;
}
