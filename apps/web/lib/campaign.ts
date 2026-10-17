/** Promo campaigns: what `GET /campaigns/current` (and the admin preview) return. All shopper-facing text is Bangla. */

export type CampaignTheme = 'MEGA_SALE' | 'PAYDAY' | 'EID' | 'BOISHAKH' | 'PUJA' | 'WINTER';
export type GameStyle = 'MYSTERY_BOX' | 'SPIN_WHEEL';
export type RewardKind = 'VOUCHER' | 'COINS' | 'NONE';
export type CampaignStatus = 'SCHEDULED' | 'TEASER' | 'LIVE' | 'ENDED' | 'OFF';

export interface CampaignDeal {
  productSlug: string;
  title: string;
  image: string | null;
  price: number;
  regularPrice: number;
  discountPct: number;
  /** null for hand-picked products (no stock bar) */
  soldPercent: number | null;
  almostGone: boolean;
  soldOut: boolean;
}

export interface CampaignReward {
  id: string;
  kind: RewardKind;
  label: string;
  /** Chance in percent (one decimal); 0 when out of stock */
  odds: number;
  sortOrder: number;
}

export interface CampaignView {
  id: string;
  slug: string;
  status: 'TEASER' | 'LIVE';
  startsAt: string;
  endsAt: string;
  theme: CampaignTheme;
  title: string;
  tagline: string | null;
  heroImageUrl: string | null;
  cta: { label: string; href: string };
  confetti: boolean;
  /** Starburst text, e.g. "সর্বোচ্চ ৭০% ছাড়" */
  badge: string | null;
  ticker: { text: string; href: string | null }[];
  voucher: { id: string; title: string; label: string; minSpend: number } | null;
  game: { style: GameStyle; rewards: CampaignReward[] } | null;
  deals: CampaignDeal[];
  /** When this answer next changes (start, a flash sale behind the deals starting or ending, the end…). */
  refreshAt: string;
}

export interface CurrentCampaign {
  serverNow: string;
  campaign: CampaignView | null;
  /** When the answer next changes; with no campaign showing, when the next teaser starts. Absent in previews. */
  refreshAt?: string | null;
}

export interface RewardResult {
  id: string;
  kind: RewardKind;
  label: string;
  voucherCode?: string;
  coins?: number;
}

export interface CampaignMe {
  voucherCollected: boolean;
  playedToday: boolean;
  todayReward: RewardResult | null;
}

export const THEME_LABEL: Record<CampaignTheme, string> = {
  MEGA_SALE: 'Mega sale',
  PAYDAY: 'Payday',
  EID: 'Eid',
  BOISHAKH: 'Pohela Boishakh',
  PUJA: 'Puja',
  WINTER: 'Winter',
};
