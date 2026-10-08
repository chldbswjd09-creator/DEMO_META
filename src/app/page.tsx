"use client";

import { AuthGate } from "@/components/providers/AuthGate";
import { MaterialsProvider, useMaterials } from "@/components/providers/MaterialsProvider";
import { LibraryScreen } from "@/components/materials/LibraryScreen";
import { CreateScreen } from "@/components/materials/CreateScreen";
import { MaterialDetail } from "@/components/materials/MaterialDetail";
import { AggregateView } from "@/components/materials/AggregateView";
import { CompareView } from "@/components/materials/CompareView";
import { IntegratedView } from "@/components/materials/IntegratedView";
import { PeriodCompareView } from "@/components/materials/PeriodCompareView";

// 분석 자료 라이브러리 → 생성/상세/통합/비교/기간비교 화면 전환 (인증 통과 후 접근)
function Dashboard() {
  const { view } = useMaterials();
  if (view === "create") return <CreateScreen />;
  if (view === "detail") return <MaterialDetail />;
  if (view === "integrated") return <IntegratedView />;
  if (view === "period") return <PeriodCompareView />;
  if (view === "aggregate") return <AggregateView />;
  if (view === "compare") return <CompareView />;
  return <LibraryScreen />;
}

export default function HomePage() {
  // AuthGate(탭 세션 게이트) 통과 후에만 MaterialsProvider 가 마운트되어 데이터를 로드한다.
  return (
    <AuthGate>
      <MaterialsProvider>
        <Dashboard />
      </MaterialsProvider>
    </AuthGate>
  );
}
