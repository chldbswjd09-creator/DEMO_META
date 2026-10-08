// '분석 자료'(하나의 CSV) 도메인 타입.

import type { Mapping } from "@/lib/csv/mapping";
import type { PerfField } from "@/lib/csv/columnMap";
import type { AggregatedInsight, CreativeType, Verdict } from "@/lib/types";

export interface MaterialFileMeta {
  name: string;
  size: number;
  encoding: string;
  delimiter: string;
}

// 공용 저장소(Supabase, 서버 API 경유)에 저장되는 분석 자료
export interface Material {
  id: string;
  name: string;
  tags: string[];
  memo: string;
  periodStart?: string;
  periodEnd?: string;
  createdAt: string; // ISO
  file: MaterialFileMeta;
  headers: string[];
  rows: Record<string, string>[]; // 원본 파싱 행 (재계산·원본CSV 재생성용)
  mapping: Mapping;
  // 수기 입력 캠페인명 — CSV에 캠페인명이 없을 때 보완용. CSV 자동 캠페인명을 덮어쓰지 않는다.
  // (없을 수 있음 = 기존 자료 호환. 표시 우선순위: CSV 캠페인명 > manualCampaignName > '캠페인명 미등록')
  manualCampaignName?: string;
}

// 분석 자료 내 광고 1건 (자료 안에서 광고 ID 기준으로 합산됨)
export interface MaterialAdRow {
  key: string;
  adId?: string;
  accountName: string;
  campaignName: string;
  adSetName: string;
  adName: string;
  adSetKey: string;
  creativeType: CreativeType;
  agg: AggregatedInsight;
}

// 자료를 분석해 계산한 결과 (메모리)
export interface MaterialAnalysis {
  id: string;
  name: string;
  tags: string[];
  periodStart?: string;
  periodEnd?: string;
  present: PerfField[];
  total: AggregatedInsight;
  ads: MaterialAdRow[];
  adCount: number;
  verdict: Verdict;
  warnings: string[];
}

// 수익성 입력값 저장 (분석 자료 1개당 레코드 1개).
// BEP ROAS는 사이트가 계산하지 않고 사용자가 자료 전체에 직접 입력한다.
export interface ProfitRecord {
  id: string; // = materialId
  bepRoas: number | null; // 손익분기 ROAS (%) — 자료 전체 공통, 직접 입력
}

// 자료 생성 중 임시 상태
export interface Draft {
  fileName: string;
  fileSize: number;
  encoding: string;
  delimiter: string;
  headers: string[];
  rows: Record<string, string>[];
  mapping: Mapping;
  name: string;
  periodStart: string;
  periodEnd: string;
  tagsInput: string;
  memo: string;
  autoStart?: string;
  autoEnd?: string;
}
