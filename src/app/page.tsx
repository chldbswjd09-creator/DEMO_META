"use client";

import { MaterialsProvider, useMaterials } from "@/components/providers/MaterialsProvider";
import { LibraryScreen } from "@/components/materials/LibraryScreen";
import { CreateScreen } from "@/components/materials/CreateScreen";
import { MaterialDetail } from "@/components/materials/MaterialDetail";
import { AggregateView } from "@/components/materials/AggregateView";
import { CompareView } from "@/components/materials/CompareView";
import { IntegratedView } from "@/components/materials/IntegratedView";
import { PeriodCompareView } from "@/components/materials/PeriodCompareView";

// 분석 자료 라이브러리 → 생성/상세/통합/비교/기간비교 화면 전환
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

// 포트폴리오 데모: 로그인/인증 없이 즉시 대시보드 표시. 데이터는 브라우저 로컬 저장소 사용.
export default function HomePage() {
  return (
    <MaterialsProvider>
      <Dashboard />
    </MaterialsProvider>
  );
}
