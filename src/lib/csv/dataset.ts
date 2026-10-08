// 파싱된 CSV + 매핑 → 광고별 집계 데이터셋(현재/이전 매칭, 계층, 경고).

import type { AggregatedInsight, CreativeType } from "@/lib/types";
import { emptyAgg } from "@/lib/metrics/calc";
import type { ParsedFile } from "@/lib/csv/parse";
import { normalizeMapping, type Mapping } from "@/lib/csv/mapping";
import { type CanonicalField, type PerfField, PERF_FIELDS } from "@/lib/csv/columnMap";
import { isPurchaseResultType, mergePurchasesSource } from "@/lib/csv/purchaseFallback";

export type MatchStatus = "matched" | "current_only" | "previous_only";

export interface AdRecord {
  key: string;
  adId?: string;
  adName: string;
  adSetKey: string;
  adSetId?: string;
  adSetName: string;
  campaignKey: string;
  campaignId?: string;
  campaignName: string;
  accountKey: string;
  accountId?: string;
  accountName: string;
  adStatus?: string;
  creativeType: CreativeType;
  creativeTypeAuto: boolean;
  cur: AggregatedInsight | null;
  prev: AggregatedInsight | null;
  match: MatchStatus;
  hasNoId: boolean;
  nameDuplicate: boolean;
}

export interface DatasetWarning {
  type: "dup_id" | "dup_name" | "no_id" | "date_conflict" | "duplicate_row";
  message: string;
}

export interface AdNode {
  key: string;
}
export interface AdSetNode {
  key: string;
  id?: string;
  name: string;
  adKeys: string[];
}
export interface CampaignNode {
  key: string;
  id?: string;
  name: string;
  adSetKeys: string[];
}
export interface AccountNode {
  key: string;
  id?: string;
  name: string;
  campaignKeys: string[];
}

export interface Dataset {
  presentPerfFields: PerfField[];
  recordsByKey: Map<string, AdRecord>;
  accounts: AccountNode[];
  campaigns: Map<string, CampaignNode>;
  adSets: Map<string, AdSetNode>;
  warnings: DatasetWarning[];
  period: { current?: { start?: string; end?: string }; previous?: { start?: string; end?: string } };
  counts: {
    current: number;
    previous: number;
    matched: number;
    currentOnly: number;
    previousOnly: number;
    duplicatesSkipped: number;
  };
}

function parseNumber(raw: string | undefined): number {
  if (raw == null) return 0;
  const s = String(raw).trim();
  if (s === "" || s === "-" || s === "—") return 0;
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function cell(row: Record<string, string>, mapping: Mapping, field: CanonicalField): string | undefined {
  const header = mapping[field].header;
  if (!header) return undefined;
  const v = row[header];
  return v == null ? undefined : String(v).trim();
}

// 광고 이름의 유형 표기(_image_ / _video_)로 분류. 성과 지표(영상 재생 등)로 추정하지 않는다.
export function creativeTypeFromName(adName: string): CreativeType | null {
  const n = (adName ?? "").toLowerCase();
  if (/_image(?:_|$)/.test(n)) return "image";
  if (/_video(?:_|$)/.test(n)) return "video";
  return null;
}

function inferCreativeType(
  adName: string,
  explicit: string | undefined,
): { type: CreativeType; auto: boolean } {
  // 1) 광고 이름 규칙 우선 (_image_ → 이미지, _video_ → 영상). Meta에 유형 전용 열이 없어도 이름으로 확정.
  const byName = creativeTypeFromName(adName);
  if (byName) return { type: byName, auto: false };
  // 2) 유형을 명시한 원본 열이 있으면 사용 (있을 경우에만)
  if (explicit) {
    const t = explicit.toLowerCase();
    if (/(이미지|image|photo|single image)/.test(t)) return { type: "image", auto: false };
    if (/(동영상|video|영상)/.test(t)) return { type: "video", auto: false };
    if (/(슬라이드|carousel|캐러셀)/.test(t)) return { type: "carousel", auto: false };
    return { type: "other", auto: false };
  }
  // 3) 이름·원본 열 근거가 없으면 '기타'. 영상 재생 지표로 유형을 추정하지 않는다.
  return { type: "other", auto: true };
}

interface RowInfo {
  adId?: string;
  adName: string;
  adSetId?: string;
  adSetName: string;
  campaignId?: string;
  campaignName: string;
  accountId?: string;
  accountName: string;
  adStatus?: string;
  creativeTypeRaw?: string;
}

interface PeriodBuild {
  aggByKey: Map<string, AggregatedInsight>;
  info: Map<string, RowInfo>;
  start?: string;
  end?: string;
  duplicatesSkipped: number;
  dateConflicts: number;
  usedPurchaseFallback: boolean; // '결과→구매' fallback 으로 구매를 집계한 행이 하나라도 있었는지
}

// '결과→구매' fallback 설정 (매핑에서 1회 계산, 전 행 공용).
interface PurchaseFallback {
  active: boolean; // 전용 구매 열이 없고 '결과'+'결과 표시 도구'가 모두 매핑됨
  resultHeader: string | null;
  indicatorHeader: string | null;
}

function purchaseFallbackOf(mapping: Mapping): PurchaseFallback {
  const hasPurchaseColumn = !!mapping.purchases.header;
  const resultHeader = mapping.resultCount.header;
  const indicatorHeader = mapping.resultIndicator.header;
  return {
    active: !hasPurchaseColumn && !!resultHeader && !!indicatorHeader,
    resultHeader,
    indicatorHeader,
  };
}

// 반환값: 이 행에서 '결과→구매' fallback 으로 구매를 집계했는지 여부(기간 단위 present 판단용)
function addAgg(
  target: AggregatedInsight,
  row: Record<string, string>,
  mapping: Mapping,
  present: Set<PerfField>,
  fb: PurchaseFallback,
): boolean {
  for (const f of PERF_FIELDS) {
    if (!present.has(f)) continue;
    const n = parseNumber(cell(row, mapping, f));
    switch (f) {
      case "spend": target.spend += n; break;
      case "impressions": target.impressions += n; break;
      case "reach": target.reach += n; break;
      case "linkClicks": target.linkClicks += n; break;
      case "landingPageViews": target.landingPageViews += n; break;
      case "purchases": target.purchases += n; break;
      case "purchaseValue": target.purchaseValue += n; break;
      case "video3s": target.video3s += n; break;
      case "video25": target.video25 += n; break;
      case "video50": target.video50 += n; break;
      case "video75": target.video75 += n; break;
      case "video95": target.video95 += n; break;
      case "video100": target.video100 += n; break;
      // purchaseRoas는 비율(배수)이라 단순 합산하지 않고 아래에서 금액으로 환산한다.
    }
  }

  // 데이터 출처 추적 (전용 열 존재 여부 기준). 임의 생성 금지의 근거로 남긴다.
  if (present.has("purchases")) target.purchasesSource = mergePurchasesSource(target.purchasesSource, "direct_purchase_column");
  if (present.has("purchaseValue")) target.purchaseValueSource = "direct_purchase_value_column";
  if (present.has("purchaseRoas")) target.metaRoasSource = "direct_meta_roas_column";

  // 전용 구매 열이 없을 때만: 같은 행 '결과 표시 도구'가 purchase 인 경우에 한해 '결과' 값을 구매로 사용.
  let usedFallback = false;
  if (fb.active && !present.has("purchases")) {
    const indicator = fb.indicatorHeader ? row[fb.indicatorHeader] : undefined;
    if (isPurchaseResultType(indicator)) {
      const c = parseNumber(fb.resultHeader ? row[fb.resultHeader] : undefined);
      target.purchases += c;
      target.purchasesSource = mergePurchasesSource(target.purchasesSource, "result_purchase_fallback");
      usedFallback = true;
    }
  }

  // Meta 구매 ROAS(배수) → 행별 광고비 × ROAS 를 누적 (매출 역산용, 기존 동작 유지)
  if (present.has("purchaseRoas") && present.has("spend")) {
    const rowSpend = parseNumber(cell(row, mapping, "spend"));
    const rowRoas = parseNumber(cell(row, mapping, "purchaseRoas"));
    target.metaRevenueEst += rowSpend * rowRoas;
  }
  target.hasData = true;
  return usedFallback;
}

function keyForRow(info: {
  adId?: string;
  accountName: string;
  campaignName: string;
  adSetName: string;
  adName: string;
}): string {
  if (info.adId) return `id:${info.adId}`;
  return `nm:${info.accountName}||${info.campaignName}||${info.adSetName}||${info.adName}`;
}

function buildPeriod(files: ParsedFile[], mapping: Mapping, present: Set<PerfField>, fb: PurchaseFallback): PeriodBuild {
  const aggByKey = new Map<string, AggregatedInsight>();
  const info = new Map<string, RowInfo>();
  const seenSig = new Set<string>();
  const seenKeyDate = new Map<string, string>(); // key||date -> perfHash
  let duplicatesSkipped = 0;
  let dateConflicts = 0;
  let usedPurchaseFallback = false;
  let start: string | undefined;
  let end: string | undefined;

  for (const file of files) {
    for (const row of file.rows) {
      const adId = cell(row, mapping, "adId") || undefined;
      const adName = cell(row, mapping, "adName") || adId || "(광고명 없음)";
      const adSetName = cell(row, mapping, "adSetName") || "(광고세트 없음)";
      const campaignName = cell(row, mapping, "campaignName") || "(캠페인 없음)";
      const accountName = cell(row, mapping, "accountName") || "(광고계정)";
      const date = cell(row, mapping, "date") || "";
      const rStart = cell(row, mapping, "reportStart");
      const rEnd = cell(row, mapping, "reportEnd");
      if (rStart && (!start || rStart < start)) start = rStart;
      if (rEnd && (!end || rEnd > end)) end = rEnd;
      if (date) {
        if (!start || date < start) start = date;
        if (!end || date > end) end = date;
      }

      const key = keyForRow({ adId, accountName, campaignName, adSetName, adName });

      // 성과 해시 (중복 검사). fallback 활성 시 '결과'/'결과 표시 도구'도 포함해
      // 결과값만 다른 행이 잘못 중복 처리되지 않게 한다.
      const perfHash = PERF_FIELDS.filter((f) => present.has(f))
        .map((f) => parseNumber(cell(row, mapping, f)))
        .join(",");
      const fbHash = fb.active
        ? `||${fb.resultHeader ? row[fb.resultHeader] ?? "" : ""}||${fb.indicatorHeader ? row[fb.indicatorHeader] ?? "" : ""}`
        : "";
      const sig = `${key}||${date}||${perfHash}${fbHash}`;
      if (seenSig.has(sig)) {
        duplicatesSkipped++;
        continue; // 완전히 동일한 행 = 중복 → 건너뜀
      }
      seenSig.add(sig);

      if (date) {
        const kd = `${key}||${date}`;
        const prevHash = seenKeyDate.get(kd);
        if (prevHash !== undefined) {
          // 같은 광고+날짜인데 값이 다름 → 이중 집계 방지 위해 건너뛰고 경고
          dateConflicts++;
          continue;
        }
        seenKeyDate.set(kd, perfHash);
      }

      let agg = aggByKey.get(key);
      if (!agg) {
        agg = emptyAgg();
        agg.hasVideoData = present.has("video3s");
        aggByKey.set(key, agg);
      }
      if (addAgg(agg, row, mapping, present, fb)) usedPurchaseFallback = true;

      if (!info.has(key)) {
        info.set(key, {
          adId,
          adName,
          adSetId: cell(row, mapping, "adSetId") || undefined,
          adSetName,
          campaignId: cell(row, mapping, "campaignId") || undefined,
          campaignName,
          accountId: cell(row, mapping, "accountId") || undefined,
          accountName,
          adStatus: cell(row, mapping, "adStatus") || undefined,
          creativeTypeRaw: cell(row, mapping, "creativeType") || undefined,
        });
      }
    }
  }

  return { aggByKey, info, start, end, duplicatesSkipped, dateConflicts, usedPurchaseFallback };
}

export function buildDataset(
  currentFiles: ParsedFile[],
  previousFiles: ParsedFile[],
  rawMapping: Mapping,
): Dataset {
  const mapping = normalizeMapping(rawMapping); // 이전 버전에 없던 필드 키 보강
  const present = new Set<PerfField>(PERF_FIELDS.filter((f) => mapping[f].header));
  const fb = purchaseFallbackOf(mapping);
  const cur = buildPeriod(currentFiles, mapping, present, fb);
  const prev = previousFiles.length ? buildPeriod(previousFiles, mapping, present, fb) : null;

  // 전용 구매 열은 없지만 '결과(purchase)' fallback 으로 구매를 실제 집계했다면
  // purchases 를 '원본 근거 있는 열'로 취급해 구매전환율/CPA 등이 '원본 열 없음'으로 막히지 않게 한다.
  if (cur.usedPurchaseFallback || prev?.usedPurchaseFallback) present.add("purchases");

  const warnings: DatasetWarning[] = [];
  const recordsByKey = new Map<string, AdRecord>();
  const allKeys = new Set<string>([...cur.aggByKey.keys(), ...(prev ? prev.aggByKey.keys() : [])]);

  // 이름 중복 감지: 같은 (계층 이름) 인데 서로 다른 ID
  const nameToIds = new Map<string, Set<string>>();
  for (const build of [cur, prev].filter(Boolean) as PeriodBuild[]) {
    for (const [key, i] of build.info) {
      if (i.adId) {
        const nk = `${i.accountName}||${i.campaignName}||${i.adSetName}||${i.adName}`;
        const set = nameToIds.get(nk) ?? new Set();
        set.add(i.adId);
        nameToIds.set(nk, set);
      }
      void key;
    }
  }
  const dupNameKeys = new Set(
    [...nameToIds.entries()].filter(([, ids]) => ids.size > 1).map(([nk]) => nk),
  );

  let matched = 0;
  let currentOnly = 0;
  let previousOnly = 0;
  let noIdCount = 0;

  for (const key of allKeys) {
    const info = cur.info.get(key) ?? (prev ? prev.info.get(key) : undefined)!;
    const curAgg = cur.aggByKey.get(key) ?? null;
    const prevAgg = prev ? prev.aggByKey.get(key) ?? null : null;
    const match: MatchStatus = curAgg && prevAgg ? "matched" : curAgg ? "current_only" : "previous_only";
    if (match === "matched") matched++;
    else if (match === "current_only") currentOnly++;
    else previousOnly++;

    const hasNoId = !info.adId;
    if (hasNoId) noIdCount++;

    const ct = inferCreativeType(info.adName, info.creativeTypeRaw);
    const nk = `${info.accountName}||${info.campaignName}||${info.adSetName}||${info.adName}`;

    const accountKey = info.accountId ? `aid:${info.accountId}` : `an:${info.accountName}`;
    const campaignKey = info.campaignId
      ? `cid:${info.campaignId}`
      : `${accountKey}||cn:${info.campaignName}`;
    const adSetKey = info.adSetId ? `sid:${info.adSetId}` : `${campaignKey}||sn:${info.adSetName}`;

    recordsByKey.set(key, {
      key,
      adId: info.adId,
      adName: info.adName,
      adSetKey,
      adSetId: info.adSetId,
      adSetName: info.adSetName,
      campaignKey,
      campaignId: info.campaignId,
      campaignName: info.campaignName,
      accountKey,
      accountId: info.accountId,
      accountName: info.accountName,
      adStatus: info.adStatus,
      creativeType: ct.type,
      creativeTypeAuto: ct.auto,
      cur: curAgg,
      prev: prevAgg,
      match,
      hasNoId,
      nameDuplicate: dupNameKeys.has(nk),
    });
  }

  // 계층 구성 (현재 기간에 존재하는 광고 기준으로 표시)
  const accounts = new Map<string, AccountNode>();
  const campaigns = new Map<string, CampaignNode>();
  const adSets = new Map<string, AdSetNode>();
  for (const rec of recordsByKey.values()) {
    if (!accounts.has(rec.accountKey))
      accounts.set(rec.accountKey, { key: rec.accountKey, id: rec.accountId, name: rec.accountName, campaignKeys: [] });
    if (!campaigns.has(rec.campaignKey))
      campaigns.set(rec.campaignKey, { key: rec.campaignKey, id: rec.campaignId, name: rec.campaignName, adSetKeys: [] });
    if (!adSets.has(rec.adSetKey))
      adSets.set(rec.adSetKey, { key: rec.adSetKey, id: rec.adSetId, name: rec.adSetName, adKeys: [] });

    const acc = accounts.get(rec.accountKey)!;
    if (!acc.campaignKeys.includes(rec.campaignKey)) acc.campaignKeys.push(rec.campaignKey);
    const camp = campaigns.get(rec.campaignKey)!;
    if (!camp.adSetKeys.includes(rec.adSetKey)) camp.adSetKeys.push(rec.adSetKey);
    adSets.get(rec.adSetKey)!.adKeys.push(rec.key);
  }

  // 경고 집계
  if (noIdCount > 0)
    warnings.push({ type: "no_id", message: `광고 ID가 없는 항목이 ${noIdCount}건 있어 이름으로 매칭했습니다.` });
  if (dupNameKeys.size > 0)
    warnings.push({
      type: "dup_name",
      message: `이름이 같지만 ID가 다른 항목이 ${dupNameKeys.size}건 있습니다. 자동으로 합치지 않았습니다.`,
    });
  const dupSkipped = cur.duplicatesSkipped + (prev?.duplicatesSkipped ?? 0);
  if (dupSkipped > 0)
    warnings.push({ type: "duplicate_row", message: `동일한 중복 행 ${dupSkipped}건을 병합에서 제외했습니다.` });
  const dateConf = cur.dateConflicts + (prev?.dateConflicts ?? 0);
  if (dateConf > 0)
    warnings.push({
      type: "date_conflict",
      message: `같은 광고·같은 날짜에 값이 다른 행 ${dateConf}건을 이중 집계 방지를 위해 제외했습니다.`,
    });

  return {
    presentPerfFields: [...present],
    recordsByKey,
    accounts: [...accounts.values()],
    campaigns,
    adSets,
    warnings,
    period: {
      current: { start: cur.start, end: cur.end },
      previous: prev ? { start: prev.start, end: prev.end } : undefined,
    },
    counts: {
      current: cur.aggByKey.size,
      previous: prev ? prev.aggByKey.size : 0,
      matched,
      currentOnly,
      previousOnly,
      duplicatesSkipped: dupSkipped,
    },
  };
}
