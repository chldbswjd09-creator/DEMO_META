// 데이터 서비스 (Mock) — 실제 연동 시 Supabase/Meta API 호출로 교체.
// UI는 이 인터페이스에만 의존한다.

import type {
  Ad,
  AdAccount,
  AdSet,
  AnalysisSettings,
  BusinessPortfolio,
  Campaign,
  DateRange,
} from "@/lib/types";
import {
  ADS,
  AD_ACCOUNTS,
  AD_SETS,
  CAMPAIGNS,
  PORTFOLIOS,
  USER_ACCESS,
} from "@/lib/mock/data";
import type { EntityRollup } from "@/lib/analysis/analyze";
import { rollupForAds } from "@/lib/analysis/analyze";

function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((r) => setTimeout(() => r(value), ms));
}

export interface CampaignRow extends Campaign {
  adSetCount: number;
  adCount: number;
  rollup: EntityRollup;
}
export interface AdSetRow extends AdSet {
  adCount: number;
  rollup: EntityRollup;
}
export interface AdRow extends Ad {
  rollup: EntityRollup;
}

export interface DataService {
  listPortfolios(userEmail: string): Promise<BusinessPortfolio[]>;
  listAdAccounts(userEmail: string, portfolioId?: string): Promise<AdAccount[]>;
  getAdAccount(id: string): Promise<AdAccount | null>;
  canAccessAccount(userEmail: string, adAccountId: string): Promise<boolean>;
  listCampaigns(adAccountId: string, range: DateRange, now: Date, settings: AnalysisSettings): Promise<CampaignRow[]>;
  listAdSets(campaignId: string, range: DateRange, now: Date, settings: AnalysisSettings): Promise<AdSetRow[]>;
  listAds(adSetId: string, range: DateRange, now: Date, settings: AnalysisSettings): Promise<AdRow[]>;
}

function adIdsForCampaign(campaignId: string): string[] {
  const setIds = AD_SETS.filter((s) => s.campaignId === campaignId).map((s) => s.id);
  return ADS.filter((a) => setIds.includes(a.adSetId)).map((a) => a.id);
}
function adIdsForAdSet(adSetId: string): string[] {
  return ADS.filter((a) => a.adSetId === adSetId).map((a) => a.id);
}

class MockDataService implements DataService {
  async listPortfolios(userEmail: string): Promise<BusinessPortfolio[]> {
    const access = USER_ACCESS[userEmail.toLowerCase()];
    const ids = access?.portfolioIds ?? [];
    return delay(PORTFOLIOS.filter((p) => ids.includes(p.id)));
  }

  async listAdAccounts(userEmail: string, portfolioId?: string): Promise<AdAccount[]> {
    const access = USER_ACCESS[userEmail.toLowerCase()];
    const ids = access?.adAccountIds ?? [];
    return delay(
      AD_ACCOUNTS.filter(
        (a) => ids.includes(a.id) && (!portfolioId || a.portfolioId === portfolioId),
      ),
    );
  }

  async getAdAccount(id: string): Promise<AdAccount | null> {
    return delay(AD_ACCOUNTS.find((a) => a.id === id) ?? null, 100);
  }

  async canAccessAccount(userEmail: string, adAccountId: string): Promise<boolean> {
    const access = USER_ACCESS[userEmail.toLowerCase()];
    return delay(!!access && access.adAccountIds.includes(adAccountId), 50);
  }

  async listCampaigns(
    adAccountId: string,
    range: DateRange,
    now: Date,
    settings: AnalysisSettings,
  ): Promise<CampaignRow[]> {
    const rows = CAMPAIGNS.filter((c) => c.adAccountId === adAccountId).map((c) => {
      const setIds = AD_SETS.filter((s) => s.campaignId === c.id).map((s) => s.id);
      const adIds = adIdsForCampaign(c.id);
      return {
        ...c,
        adSetCount: setIds.length,
        adCount: adIds.length,
        rollup: rollupForAds(adIds, range, now, settings),
      };
    });
    return delay(rows);
  }

  async listAdSets(
    campaignId: string,
    range: DateRange,
    now: Date,
    settings: AnalysisSettings,
  ): Promise<AdSetRow[]> {
    const rows = AD_SETS.filter((s) => s.campaignId === campaignId).map((s) => {
      const adIds = adIdsForAdSet(s.id);
      return { ...s, adCount: adIds.length, rollup: rollupForAds(adIds, range, now, settings) };
    });
    return delay(rows);
  }

  async listAds(
    adSetId: string,
    range: DateRange,
    now: Date,
    settings: AnalysisSettings,
  ): Promise<AdRow[]> {
    const rows = ADS.filter((a) => a.adSetId === adSetId).map((a) => ({
      ...a,
      rollup: rollupForAds([a.id], range, now, settings),
    }));
    return delay(rows);
  }
}

export const dataService: DataService = new MockDataService();
