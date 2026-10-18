/** Admin-side shapes for Promo campaigns (what the /admin/campaigns endpoints return). */
import type { CampaignStatus, CampaignTheme, GameStyle, RewardKind } from '@/lib/campaign';

export interface CampaignListRow {
  id: string;
  slug: string;
  title: string;
  theme: CampaignTheme;
  startsAt: string;
  endsAt: string;
  teaserHours: number;
  priority: number;
  isActive: boolean;
  gameEnabled: boolean;
  gameStyle: GameStyle;
  plays: number;
  status: CampaignStatus;
}

export interface CampaignProductRow {
  variantId: string;
  sku: string;
  title: string;
  variantLabel: string | null;
  price: number;
  image: string | null;
  isActive: boolean;
}

export interface CampaignRewardRow {
  id: string;
  kind: RewardKind;
  voucherId: string | null;
  coins: number | null;
  label: string;
  weight: number;
  stock: number | null;
  givenCount: number;
  sortOrder: number;
}

export interface CampaignDetail {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  theme: CampaignTheme;
  heroImageUrl: string | null;
  ctaLabel: string;
  ctaHref: string;
  startsAt: string;
  endsAt: string;
  teaserHours: number;
  priority: number;
  confetti: boolean;
  gameEnabled: boolean;
  gameStyle: GameStyle;
  isActive: boolean;
  voucherId: string | null;
  flashSaleId: string | null;
  status: CampaignStatus;
  ticker: { text: string; href: string | null; sortOrder: number }[];
  rewards: CampaignRewardRow[];
  products: CampaignProductRow[];
}

export interface CampaignStats {
  plays: number;
  players: number;
  playsPerDay: { day: string; plays: number }[];
  rewards: { id: string; label: string; kind: RewardKind; givenCount: number; stock: number | null }[];
  voucherCollects: number;
  voucherOrders: number;
}

/** The fields of GET /admin/vouchers the pickers need. */
export interface VoucherOption {
  id: string;
  code: string;
  title: string;
  type: 'PERCENT' | 'FIXED' | 'FREE_SHIPPING';
  value: number;
  maxDiscount: number | null;
  isActive: boolean;
  isCollectible: boolean;
  startsAt: string;
  endsAt: string;
}

/** The fields of GET /admin/flash-sales the picker needs. */
export interface FlashSaleOption {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  items: unknown[];
}

/** Body of POST /admin/campaigns and PATCH /admin/campaigns/:id. */
export interface CampaignBody {
  slug: string;
  title: string;
  tagline: string | null;
  theme: CampaignTheme;
  heroImageUrl: string | null;
  ctaLabel: string;
  ctaHref: string;
  startsAt: string;
  endsAt: string;
  teaserHours: number;
  priority: number;
  confetti: boolean;
  gameEnabled: boolean;
  gameStyle: GameStyle;
  isActive: boolean;
  voucherId: string | null;
  flashSaleId: string | null;
  productIds: string[];
  ticker: { text: string; href: string | null }[];
  rewards: { id?: string; kind: RewardKind; voucherId?: string | null; coins?: number | null; label: string; weight: number; stock?: number | null }[];
}

/** The saved campaign as a request body, e.g. to switch it off from the list. */
export function detailToBody(d: CampaignDetail): CampaignBody {
  return {
    slug: d.slug,
    title: d.title,
    tagline: d.tagline,
    theme: d.theme,
    heroImageUrl: d.heroImageUrl,
    ctaLabel: d.ctaLabel,
    ctaHref: d.ctaHref,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    teaserHours: d.teaserHours,
    priority: d.priority,
    confetti: d.confetti,
    gameEnabled: d.gameEnabled,
    gameStyle: d.gameStyle,
    isActive: d.isActive,
    voucherId: d.voucherId,
    flashSaleId: d.flashSaleId,
    productIds: d.products.map((p) => p.variantId),
    ticker: [...d.ticker].sort((a, b) => a.sortOrder - b.sortOrder).map((t) => ({ text: t.text, href: t.href })),
    rewards: [...d.rewards]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({ id: r.id, kind: r.kind, voucherId: r.voucherId, coins: r.coins, label: r.label, weight: r.weight, stock: r.stock })),
  };
}

export const GAME_LABEL: Record<GameStyle, string> = {
  MYSTERY_BOX: 'Mystery box',
  SPIN_WHEEL: 'Spin wheel',
};

export const REWARD_KIND_LABEL: Record<RewardKind, string> = {
  VOUCHER: 'Voucher',
  COINS: 'Coins',
  NONE: 'Nothing',
};

/** Rewards a game style needs. */
export const REWARD_RULE: Record<GameStyle, { min: number; max: number }> = {
  MYSTERY_BOX: { min: 2, max: 10 },
  SPIN_WHEEL: { min: 4, max: 10 },
};

export const MAX_PRODUCTS = 24;
export const MAX_TICKER = 10;
export const MAX_REWARDS = 10;

/** Links the API accepts: a store path or a full https:// address. */
export const LINK_RE = /^(\/(?!\/)|https:\/\/)\S*$/;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 0–9 → ০–৯ for numbers inside Bangla labels. */
export function bn(value: number | string): string {
  return String(value).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);
}

/** The Bangla reward label the storefront would use for a voucher: "৳৫০ ছাড়", "১০% ছাড়", "ফ্রি ডেলিভারি". */
export function voucherRewardLabel(v: Pick<VoucherOption, 'type' | 'value'>): string {
  if (v.type === 'FREE_SHIPPING') return 'ফ্রি ডেলিভারি';
  if (v.type === 'PERCENT') return `${bn(v.value)}% ছাড়`;
  return `৳${bn(v.value)} ছাড়`;
}
