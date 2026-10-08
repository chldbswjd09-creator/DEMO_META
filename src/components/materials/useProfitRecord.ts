"use client";

// 자료별 BEP ROAS 입력값(ProfitRecord)을 공용 저장소(Supabase, 서버 API)에서 로드/저장하는 훅.
// MaterialDetail이 한 번 로드해 그래프·요약·진단·상세에 동일 BEP ROAS를 내려준다.

import { useEffect, useState } from "react";
import type { ProfitRecord } from "@/lib/materials/types";
import { getProfit, putProfit } from "@/lib/materials/store";

function empty(id: string): ProfitRecord {
  return { id, bepRoas: null };
}

export function useProfitRecord(materialId: string) {
  const [record, setRecord] = useState<ProfitRecord | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRecord(null);
    setSaveError(null);
    getProfit(materialId).then((r) => {
      // 구모델(실제 총매출 등) 레코드는 bepRoas가 없으므로 미입력으로 취급
      if (!cancelled) setRecord({ id: materialId, bepRoas: r?.bepRoas ?? null });
    });
    return () => {
      cancelled = true;
    };
  }, [materialId]);

  const setBepRoas = (value: number | null) => {
    const base = record ?? empty(materialId);
    const prevValue = base.bepRoas; // 실패 시 롤백용 이전 정상값
    const next: ProfitRecord = { ...base, bepRoas: value };
    setSaveError(null);
    setRecord(next); // 낙관적 반영
    putProfit(next).catch((e) => {
      // 공용 저장 실패 → 이전 값으로 롤백하고 실패를 표시(저장된 것처럼 보이지 않게).
      setRecord((cur) => ({ ...(cur ?? empty(materialId)), bepRoas: prevValue }));
      setSaveError(
        `BEP ROAS를 공용 저장소에 저장하지 못했습니다. 값이 저장되지 않았습니다. 다시 시도해주세요.${e instanceof Error && e.message ? ` (${e.message})` : ""}`,
      );
    });
  };

  return { record, setBepRoas, saveError };
}
