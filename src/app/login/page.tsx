"use client";

// 공용 비밀번호 로그인 화면. 비밀번호는 서버(/api/auth/login)에서만 검증한다.
// 프론트엔드에는 비밀번호를 저장하지 않는다.

import { useState } from "react";
import { startTabSession } from "@/lib/auth/tabSession";
import { LogoMark } from "@/components/ui/Logo";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        // 이 탭의 로그인 상태(sessionStorage 마커)를 먼저 생성한 뒤 대시보드로 이동한다.
        // (마커가 없으면 대시보드의 AuthGate 가 다시 로그인 화면으로 돌려보내 무한 루프가 된다)
        startTabSession(Date.now());
        // 전체 새로고침으로 미들웨어 재평가 + 대시보드 마운트
        window.location.href = "/";
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error || "비밀번호가 올바르지 않습니다.");
    } catch {
      setError("로그인 요청에 실패했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white/90 p-7 shadow-card backdrop-blur">
        <div className="mb-1 flex flex-col items-center gap-3 text-center">
          <LogoMark size={52} />
          <h1 className="text-lg font-bold tracking-tight text-slate-800">광고 성과 분석</h1>
        </div>
        <p className="mb-5 text-center text-xs text-slate-500">공용 비밀번호를 입력해 접속하세요.</p>

        <label className="mb-1 block text-[11px] font-medium text-slate-500">비밀번호</label>
        <div className="flex items-center gap-2">
          <input
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="current-password"
            placeholder="공용 비밀번호"
            className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="shrink-0 rounded-md border border-slate-300 px-2 py-2 text-[11px] text-slate-500 hover:bg-slate-50"
            aria-label={show ? "비밀번호 숨기기" : "비밀번호 보기"}
          >
            {show ? "숨기기" : "보기"}
          </button>
        </div>

        {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

        <button
          type="submit"
          disabled={busy || password.length === 0}
          className="mt-5 w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-pop hover:bg-brand-dark disabled:opacity-50 disabled:shadow-none"
        >
          {busy ? "확인 중…" : "접속"}
        </button>
      </form>
    </div>
  );
}
