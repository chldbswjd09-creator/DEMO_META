// 광고 운영 상태 — 자동 판정과 별개로 사용자가 직접 관리. Supabase에 저장(광고 ID 우선, 없으면 정규화 이름).
export type AdStatus = "active" | "off" | "deleted";

export const AD_STATUS_LABEL: Record<AdStatus, string> = {
  active: "집행 중",
  off: "OFF 처리",
  deleted: "삭제됨",
};
export const AD_STATUS_OPTIONS: AdStatus[] = ["active", "off", "deleted"];

export function isAdStatus(v: unknown): v is AdStatus {
  return v === "active" || v === "off" || v === "deleted";
}
export function normalizeAdStatus(v: unknown): AdStatus {
  return isAdStatus(v) ? v : "active";
}
