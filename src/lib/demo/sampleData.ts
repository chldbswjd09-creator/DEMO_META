// 포트폴리오 데모용 샘플 데이터.
// 실제 업무 데이터가 아닌 가상의 수치이며, 실제 CSV 업로드와 동일한 구조(headers/rows/mapping)로
// 만들어 모든 분석·차트·필터가 그대로 동작한다. 회사명/고객정보/실매출은 포함하지 않는다.

import { autoMap } from "@/lib/csv/mapping";
import type { Material } from "@/lib/materials/types";

// 인식되는 Meta(한국어) 열 이름 (columnMap 변형과 일치)
const HEADERS = [
  "캠페인 이름", "캠페인 ID", "광고 세트 이름", "광고 세트 ID", "광고 이름", "광고 ID", "게재",
  "보고 시작", "보고 종료", "노출", "도달", "링크 클릭", "랜딩 페이지 조회", "지출 금액",
  "구매", "구매 전환값", "구매 ROAS",
  "동영상 3초 이상 재생", "동영상 25% 재생", "동영상 50% 재생", "동영상 75% 재생", "동영상 95% 재생", "동영상 100% 재생",
];

interface AdSpec {
  adName: string;
  adId: string;
  adSetName: string;
  adSetId: string;
  impressions: number;
  frequency: number; // 노출/도달
  ctr: number; // 링크클릭/노출
  lpvRate: number; // 랜딩조회/링크클릭
  cpc: number; // 지출/링크클릭
  cvr: number; // 구매/랜딩조회
  aov: number; // 객단가
  videoPlayRate?: number; // 3초재생/노출 (영상 소재)
}

const r = Math.round;

function buildRow(campaign: string, campaignId: string, period: { start: string; end: string }, a: AdSpec): Record<string, string> {
  const impressions = a.impressions;
  const reach = r(impressions / a.frequency);
  const linkClicks = r(impressions * a.ctr);
  const lpv = r(linkClicks * a.lpvRate);
  const spend = r(linkClicks * a.cpc);
  const purchases = r(lpv * a.cvr);
  const purchaseValue = purchases * a.aov;
  const roas = spend > 0 ? purchaseValue / spend : 0;
  const isVideo = /_video(?:_|$)/.test(a.adName);
  const v3 = isVideo ? r(impressions * (a.videoPlayRate ?? 0.32)) : 0;
  return {
    "캠페인 이름": campaign,
    "캠페인 ID": campaignId,
    "광고 세트 이름": a.adSetName,
    "광고 세트 ID": a.adSetId,
    "광고 이름": a.adName,
    "광고 ID": a.adId,
    "게재": "활성",
    "보고 시작": period.start,
    "보고 종료": period.end,
    "노출": String(impressions),
    "도달": String(reach),
    "링크 클릭": String(linkClicks),
    "랜딩 페이지 조회": String(lpv),
    "지출 금액": String(spend),
    "구매": String(purchases),
    "구매 전환값": String(purchaseValue),
    "구매 ROAS": roas.toFixed(2),
    "동영상 3초 이상 재생": String(v3),
    "동영상 25% 재생": String(r(v3 * 0.62)),
    "동영상 50% 재생": String(r(v3 * 0.42)),
    "동영상 75% 재생": String(r(v3 * 0.3)),
    "동영상 95% 재생": String(r(v3 * 0.22)),
    "동영상 100% 재생": String(r(v3 * 0.18)),
  };
}

function material(opts: {
  id: string;
  name: string;
  tags: string[];
  memo: string;
  campaign: string;
  campaignId: string;
  period: { start: string; end: string };
  createdAt: string;
  ads: AdSpec[];
}): Material {
  const rows = opts.ads.map((a) => buildRow(opts.campaign, opts.campaignId, opts.period, a));
  const fileName = `${opts.name}.csv`;
  return {
    id: opts.id,
    name: opts.name,
    tags: opts.tags,
    memo: opts.memo,
    periodStart: opts.period.start,
    periodEnd: opts.period.end,
    createdAt: opts.createdAt,
    file: { name: fileName, size: rows.length * 220 + 400, encoding: "UTF-8", delimiter: "," },
    headers: HEADERS,
    rows,
    mapping: autoMap(HEADERS),
  };
}

// 샘플 자료 3종 (실제 업로드와 동일하게 매 호출 새 객체 생성)
export function sampleMaterials(): Material[] {
  const sep = { start: "2026-09-01", end: "2026-09-14" };
  const aug = { start: "2026-08-01", end: "2026-08-14" };

  const launchSepAds: AdSpec[] = [
    { adName: "가을신상_image_메인비주얼_01", adId: "AD-24091001", adSetName: "AS_여성2534_관심사패션", adSetId: "AS-30911", impressions: 420000, frequency: 1.6, ctr: 0.018, lpvRate: 0.85, cpc: 520, cvr: 0.055, aov: 42000 },
    { adName: "가을신상_image_혜택강조_02", adId: "AD-24091002", adSetName: "AS_여성2534_관심사패션", adSetId: "AS-30911", impressions: 310000, frequency: 1.5, ctr: 0.012, lpvRate: 0.78, cpc: 680, cvr: 0.03, aov: 38000 },
    { adName: "가을신상_video_15s_후킹_03", adId: "AD-24091003", adSetName: "AS_여성2534_동영상", adSetId: "AS-30912", impressions: 530000, frequency: 1.7, ctr: 0.021, lpvRate: 0.82, cpc: 470, cvr: 0.062, aov: 45000, videoPlayRate: 0.42 },
    { adName: "가을신상_video_30s_스토리_04", adId: "AD-24091004", adSetName: "AS_여성2534_동영상", adSetId: "AS-30912", impressions: 280000, frequency: 1.4, ctr: 0.009, lpvRate: 0.7, cpc: 900, cvr: 0.022, aov: 36000, videoPlayRate: 0.28 },
    { adName: "가을신상_image_고객리뷰_05", adId: "AD-24091005", adSetName: "AS_여성2534_관심사패션", adSetId: "AS-30911", impressions: 190000, frequency: 1.3, ctr: 0.016, lpvRate: 0.88, cpc: 560, cvr: 0.07, aov: 48000 },
  ];

  const retargetAds: AdSpec[] = [
    { adName: "리타겟팅_image_단독혜택_01", adId: "AD-24092001", adSetName: "AS_구매자_30일", adSetId: "AS-30921", impressions: 95000, frequency: 2.1, ctr: 0.028, lpvRate: 0.9, cpc: 440, cvr: 0.11, aov: 52000 },
    { adName: "리타겟팅_image_장바구니리마인드_02", adId: "AD-24092002", adSetName: "AS_장바구니_7일", adSetId: "AS-30922", impressions: 72000, frequency: 1.9, ctr: 0.024, lpvRate: 0.86, cpc: 500, cvr: 0.09, aov: 49000 },
    { adName: "리타겟팅_video_15s_후기모음_03", adId: "AD-24092003", adSetName: "AS_구매자_30일", adSetId: "AS-30921", impressions: 110000, frequency: 2.0, ctr: 0.02, lpvRate: 0.8, cpc: 520, cvr: 0.075, aov: 50000, videoPlayRate: 0.38 },
  ];

  const launchAugAds: AdSpec[] = [
    { adName: "가을신상_image_메인비주얼_01", adId: "AD-24081001", adSetName: "AS_여성2534_관심사패션", adSetId: "AS-30811", impressions: 260000, frequency: 1.4, ctr: 0.014, lpvRate: 0.8, cpc: 600, cvr: 0.04, aov: 40000 },
    { adName: "가을신상_video_15s_후킹_03", adId: "AD-24081003", adSetName: "AS_여성2534_동영상", adSetId: "AS-30812", impressions: 300000, frequency: 1.5, ctr: 0.016, lpvRate: 0.78, cpc: 560, cvr: 0.045, aov: 43000, videoPlayRate: 0.35 },
    { adName: "가을신상_image_혜택강조_02", adId: "AD-24081002", adSetName: "AS_여성2534_관심사패션", adSetId: "AS-30811", impressions: 180000, frequency: 1.4, ctr: 0.011, lpvRate: 0.75, cpc: 720, cvr: 0.028, aov: 37000 },
  ];

  return [
    material({
      id: "demo-sample-launch-2609",
      name: "데모_가을신상_런칭_2609",
      tags: ["데모", "전환", "9월"],
      memo: "포트폴리오 데모용 샘플 데이터 (가상 수치)",
      campaign: "가을신상_전환캠페인",
      campaignId: "CMP-24091",
      period: sep,
      createdAt: "2026-09-15T09:00:00.000Z",
      ads: launchSepAds,
    }),
    material({
      id: "demo-sample-retarget-2609",
      name: "데모_리타겟팅_재구매_2609",
      tags: ["데모", "리타겟팅", "9월"],
      memo: "포트폴리오 데모용 샘플 데이터 (가상 수치)",
      campaign: "리타겟팅_재구매",
      campaignId: "CMP-24092",
      period: sep,
      createdAt: "2026-09-15T09:10:00.000Z",
      ads: retargetAds,
    }),
    material({
      id: "demo-sample-launch-2608",
      name: "데모_가을신상_런칭_2608",
      tags: ["데모", "전환", "8월"],
      memo: "포트폴리오 데모용 샘플 데이터 (가상 수치) — 9월과 기간 비교용",
      campaign: "가을신상_전환캠페인",
      campaignId: "CMP-24091",
      period: aug,
      createdAt: "2026-08-15T09:00:00.000Z",
      ads: launchAugAds,
    }),
  ];
}
