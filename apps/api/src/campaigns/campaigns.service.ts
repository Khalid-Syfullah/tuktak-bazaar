import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CampaignTheme, CoinReason, GameStyle, Prisma, RewardKind, Voucher } from '@prisma/client';
import { EngagementService } from '../common/engagement.service';
import { pct, PricingService } from '../common/pricing.service';
import { dhakaDay } from '../common/utils';
import { Db, PrismaService } from '../prisma/prisma.service';

const HOUR = 3_600_000;
const MAX_DEALS = 12;

/** 0–9 → ০–৯, for numbers inside Bangla text. */
export function bn(value: number | string): string {
  return String(value).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);
}

/** "৳৫০ ছাড়", "১০% ছাড়", "ফ্রি ডেলিভারি" */
export function voucherLabel(v: Pick<Voucher, 'type' | 'value' | 'maxDiscount'>): string {
  if (v.type === 'FREE_SHIPPING') return 'ফ্রি ডেলিভারি';
  if (v.type === 'PERCENT') return `${bn(v.value)}% ছাড়${v.maxDiscount ? ` (সর্বোচ্চ ৳${bn(v.maxDiscount)})` : ''}`;
  return `৳${bn(v.value)} ছাড়`;
}

export type CampaignStatus = 'SCHEDULED' | 'TEASER' | 'LIVE' | 'ENDED' | 'OFF';

export function campaignStatus(
  c: { isActive: boolean; startsAt: Date; endsAt: Date; teaserHours: number },
  now = new Date(),
): CampaignStatus {
  if (!c.isActive) return 'OFF';
  if (now >= c.endsAt) return 'ENDED';
  if (now >= c.startsAt) return 'LIVE';
  if (now.getTime() >= c.startsAt.getTime() - c.teaserHours * HOUR) return 'TEASER';
  return 'SCHEDULED';
}

/** Everything the storefront needs to draw a campaign. Built from a saved campaign or from unsaved form data (preview). */
export interface CampaignInput {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  theme: CampaignTheme;
  heroImageUrl: string | null;
  ctaLabel: string;
  ctaHref: string;
  startsAt: Date;
  endsAt: Date;
  teaserHours: number;
  confetti: boolean;
  gameEnabled: boolean;
  gameStyle: GameStyle;
  voucherId: string | null;
  flashSaleId: string | null;
  productIds: string[];
  ticker: { text: string; href: string | null }[];
  rewards: { id: string; kind: RewardKind; voucherId: string | null; label: string; weight: number; stock: number | null; givenCount: number; sortOrder: number }[];
}

export interface CampaignDeal {
  productSlug: string;
  title: string;
  image: string | null;
  price: number;
  regularPrice: number;
  discountPct: number;
  soldPercent: number | null;
  almostGone: boolean;
  soldOut: boolean;
}

export interface CampaignView {
  id: string;
  slug: string;
  status: 'TEASER' | 'LIVE';
  startsAt: Date;
  endsAt: Date;
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
  game: { style: GameStyle; rewards: { id: string; kind: RewardKind; label: string; odds: number; sortOrder: number }[] } | null;
  deals: CampaignDeal[];
  /**
   * When this answer next changes: the start (during the teaser), a flash sale behind the deals starting or
   * ending, the banner voucher starting or ending, a reward voucher expiring, a higher-priority campaign's
   * teaser starting, or the end. Open pages fetch the campaign again at this moment.
   */
  refreshAt: Date;
}

export interface RewardResult {
  id: string;
  kind: RewardKind;
  label: string;
  voucherCode?: string;
  coins?: number;
}

const FULL_INCLUDE = {
  products: { orderBy: { sortOrder: 'asc' as const } },
  ticker: { orderBy: { sortOrder: 'asc' as const } },
  rewards: { orderBy: { sortOrder: 'asc' as const } },
};

type FullCampaign = Prisma.CampaignGetPayload<{ include: typeof FULL_INCLUDE }>;

export function toInput(c: FullCampaign): CampaignInput {
  return {
    ...c,
    productIds: c.products.map((p) => p.variantId),
    ticker: c.ticker.map((t) => ({ text: t.text, href: t.href })),
    rewards: c.rewards.map((r) => ({
      id: r.id,
      kind: r.kind,
      voucherId: r.voucherId,
      label: r.label,
      weight: r.weight,
      stock: r.stock,
      givenCount: r.givenCount,
      sortOrder: r.sortOrder,
    })),
  };
}

function inStock(r: { stock: number | null; givenCount: number }) {
  return r.stock == null || r.givenCount < r.stock;
}

/** A voucher reward can be won while checkout would accept its voucher: switched on, started, not expired, not fully used. */
function winnable(v: Pick<Voucher, 'isActive' | 'startsAt' | 'endsAt' | 'usageLimit' | 'usedCount'> | null | undefined, now: Date): boolean {
  return !!v && v.isActive && v.startsAt <= now && v.endsAt > now && (v.usageLimit == null || v.usedCount < v.usageLimit);
}

/** The same rule as POST /vouchers/:id/collect, so the banner never offers a button that would fail. */
function collectible(v: Voucher | null, now: Date): v is Voucher {
  return !!v && v.isActive && v.isCollectible && v.startsAt <= now && v.endsAt > now;
}

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly engagement: EngagementService,
  ) {}

  /**
   * The campaign to show now: active, in its teaser or live window, highest priority, then earliest start.
   * `refreshAt` is when this answer next changes; with no campaign to show, that's the next teaser starting.
   */
  async current(now = new Date()): Promise<{ campaign: CampaignView | null; refreshAt: Date | null }> {
    // Every campaign that hasn't ended counts, however far off: any of them can start its teaser before the
    // next refresh. Only the few columns needed to choose are read; the chosen one is then loaded in full.
    const candidates = await this.prisma.campaign.findMany({
      where: { isActive: true, endsAt: { gt: now } },
      orderBy: [{ priority: 'desc' }, { startsAt: 'asc' }],
      select: { id: true, startsAt: true, teaserHours: true },
    });
    const teaserStart = (c: (typeof candidates)[number]) => new Date(c.startsAt.getTime() - c.teaserHours * HOUR);
    const index = candidates.findIndex((c) => teaserStart(c) <= now);
    if (index < 0) {
      const next = candidates.map(teaserStart).sort((a, b) => a.getTime() - b.getTime())[0];
      return { campaign: null, refreshAt: next ?? null };
    }
    // A higher-priority campaign whose teaser hasn't started yet takes over when it does.
    const takeovers = candidates.slice(0, index).map(teaserStart);
    const campaign = await this.view(toInput(await this.full(candidates[index].id)), now, takeovers);
    return { campaign, refreshAt: campaign.refreshAt };
  }

  async view(c: CampaignInput, now = new Date(), changesAt: Date[] = []): Promise<CampaignView> {
    const rewardVoucherIds = [...new Set(c.rewards.flatMap((r) => (r.kind === 'VOUCHER' && r.voucherId ? [r.voucherId] : [])))];
    const [voucher, { deals, changes }, rewardVouchers] = await Promise.all([
      c.voucherId ? this.prisma.voucher.findUnique({ where: { id: c.voucherId } }) : null,
      this.deals(c, now),
      rewardVoucherIds.length ? this.prisma.voucher.findMany({ where: { id: { in: rewardVoucherIds } } }) : [],
    ]);
    const live = now >= c.startsAt;
    // The advertised odds use the same pool as play(): in stock, and for vouchers, still winnable.
    const available = new Set(
      c.rewards
        .filter((r) => inStock(r) && (r.kind !== 'VOUCHER' || winnable(rewardVouchers.find((v) => v.id === r.voucherId), now)))
        .map((r) => r.id),
    );
    const totalWeight = c.rewards.reduce((s, r) => s + (available.has(r.id) ? r.weight : 0), 0);
    const maxPct = deals.reduce((m, d) => Math.max(m, d.discountPct), 0);
    const voucherOk = collectible(voucher, now);
    const refreshAt = [
      c.startsAt,
      voucher?.startsAt,
      voucher?.endsAt,
      ...rewardVouchers.flatMap((v) => [v.startsAt, v.endsAt]),
      ...changes,
      ...changesAt,
    ].reduce<Date>((soonest, d) => (d && d > now && d < soonest ? d : soonest), c.endsAt);
    return {
      id: c.id,
      slug: c.slug,
      status: live ? 'LIVE' : 'TEASER',
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      theme: c.theme,
      title: c.title,
      tagline: c.tagline,
      heroImageUrl: c.heroImageUrl,
      cta: { label: c.ctaLabel, href: c.ctaHref },
      confetti: c.confetti,
      badge: maxPct >= 5 ? `সর্বোচ্চ ${bn(maxPct)}% ছাড়` : voucherOk ? voucherLabel(voucher) : null,
      ticker: c.ticker,
      voucher: voucherOk ? { id: voucher.id, title: voucher.title, label: voucherLabel(voucher), minSpend: voucher.minSpend } : null,
      game:
        c.gameEnabled && c.rewards.length
          ? {
              style: c.gameStyle,
              rewards: c.rewards.map((r) => ({
                id: r.id,
                kind: r.kind,
                label: r.label,
                sortOrder: r.sortOrder,
                odds: available.has(r.id) && totalWeight ? Math.round((r.weight / totalWeight) * 1000) / 10 : 0,
              })),
            }
          : null,
      deals,
      refreshAt,
    };
  }

  /**
   * Flash-sale items first (best sellers first), then hand-picked variants. Hidden products are skipped.
   * Flash prices only count while that flash sale is running; before or after it, its items show at their current price.
   * Also returns when those prices next change (a flash sale behind them starting or ending).
   */
  private async deals(c: Pick<CampaignInput, 'flashSaleId' | 'productIds'>, now: Date): Promise<{ deals: CampaignDeal[]; changes: Date[] }> {
    const out: CampaignDeal[] = [];
    const changes: Date[] = [];
    const seen = new Set<string>();
    const variantInclude = { product: { include: { images: { orderBy: { sortOrder: 'asc' as const }, take: 1 } } } };
    let productIds = c.productIds;
    const sale = c.flashSaleId ? await this.prisma.flashSale.findUnique({ where: { id: c.flashSaleId } }) : null;
    const saleLive = !!sale && sale.isActive && sale.startsAt <= now && now < sale.endsAt;
    if (sale?.isActive) changes.push(sale.startsAt, sale.endsAt);
    if (sale && !saleLive) {
      const ids = await this.prisma.flashSaleItem.findMany({ where: { flashSaleId: sale.id }, orderBy: { soldQty: 'desc' }, select: { variantId: true } });
      productIds = [...ids.map((i) => i.variantId), ...productIds.filter((id) => !ids.some((i) => i.variantId === id))];
    }
    if (sale && saleLive) {
      const items = await this.prisma.flashSaleItem.findMany({
        where: { flashSaleId: sale.id, variant: { isActive: true, product: { status: 'ACTIVE' } } },
        include: { variant: { include: variantInclude } },
        orderBy: { soldQty: 'desc' },
        take: MAX_DEALS,
      });
      // The price is what the product page and checkout charge (the cheapest running offer, which is usually
      // this sale); the share sold is this sale's.
      const flash = await this.pricing.activeFlash(items.map((i) => i.variantId), this.prisma, now);
      for (const i of items) {
        const sold = i.quantityLimit > 0 ? Math.min(100, Math.round((i.soldQty / i.quantityLimit) * 100)) : 0;
        const info = this.pricing.price(i.variant, flash.get(i.variantId));
        seen.add(i.variantId);
        out.push({
          productSlug: i.variant.product.slug,
          title: i.variant.product.title,
          image: i.variant.imageUrl ?? i.variant.product.images[0]?.url ?? null,
          price: info.unitPrice,
          regularPrice: info.originalPrice,
          discountPct: info.discountPct,
          soldPercent: sold,
          almostGone: sold >= 80,
          soldOut: i.soldQty >= i.quantityLimit || i.variant.stock <= 0,
        });
      }
    }
    const ids = productIds.filter((id) => !seen.has(id));
    if (ids.length && out.length < MAX_DEALS) {
      const variants = await this.prisma.productVariant.findMany({
        where: { id: { in: ids }, isActive: true, product: { status: 'ACTIVE' } },
        include: variantInclude,
      });
      const [flash, sales] = await Promise.all([
        this.pricing.activeFlash(variants.map((v) => v.id), this.prisma, now),
        // Any flash sale on these items changes their price when it starts or ends.
        this.prisma.flashSaleItem.findMany({
          where: { variantId: { in: variants.map((v) => v.id) }, flashSale: { isActive: true, endsAt: { gt: now } } },
          select: { flashSale: { select: { startsAt: true, endsAt: true } } },
        }),
      ]);
      for (const s of sales) changes.push(s.flashSale.startsAt, s.flashSale.endsAt);
      for (const id of ids) {
        const v = variants.find((x) => x.id === id);
        if (!v || out.length >= MAX_DEALS) continue;
        const info = this.pricing.price(v, flash.get(v.id));
        out.push({
          productSlug: v.product.slug,
          title: v.product.title,
          image: v.imageUrl ?? v.product.images[0]?.url ?? null,
          price: info.unitPrice,
          regularPrice: info.originalPrice,
          discountPct: info.discountPct,
          soldPercent: null,
          almostGone: false,
          soldOut: v.stock <= 0,
        });
      }
    }
    return { deals: out, changes };
  }

  // ───── The shopper's own state and the daily game ─────

  async me(campaignId: string, userId: string) {
    const c = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!c) throw new NotFoundException('এই অফারটি আর নেই');
    const [collected, play] = await Promise.all([
      c.voucherId ? this.prisma.userVoucher.findUnique({ where: { userId_voucherId: { userId, voucherId: c.voucherId } } }) : null,
      this.prisma.campaignPlay.findUnique({
        where: { campaignId_userId_playDay: { campaignId, userId, playDay: dhakaDay() } },
        include: { reward: { include: { voucher: true } } },
      }),
    ]);
    return {
      voucherCollected: !!collected,
      playedToday: !!play,
      todayReward: play ? this.result(play.reward) : null,
    };
  }

  private result(r: { id: string; kind: RewardKind; label: string; coins: number | null; voucher: Voucher | null } | null): RewardResult {
    if (!r) return { id: '', kind: 'NONE', label: 'আবার চেষ্টা করুন' };
    return {
      id: r.id,
      kind: r.kind,
      label: r.label,
      ...(r.kind === 'VOUCHER' && r.voucher ? { voucherCode: r.voucher.code } : {}),
      ...(r.kind === 'COINS' && r.coins ? { coins: r.coins } : {}),
    };
  }

  /** One play per Dhaka day. The server picks the reward by weight among rewards with stock left; the browser only animates it. */
  async play(campaignId: string, userId: string): Promise<{ reward: RewardResult }> {
    const now = new Date();
    const c = await this.prisma.campaign.findUnique({ where: { id: campaignId } });
    if (!c || !c.isActive) throw new NotFoundException('এই অফারটি আর নেই');
    if (now < c.startsAt || now >= c.endsAt) throw new BadRequestException('অফারটি এখন চালু নেই');
    if (!c.gameEnabled) throw new BadRequestException('এই অফারে কোনো খেলা নেই');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const play = await tx.campaignPlay.create({ data: { campaignId, userId, playDay: dhakaDay(now) } });
        const rewards = await tx.campaignReward.findMany({ where: { campaignId }, include: { voucher: true }, orderBy: { sortOrder: 'asc' } });
        const voucherIds = rewards.flatMap((r) => (r.kind === 'VOUCHER' && r.voucherId ? [r.voucherId] : []));
        const held = new Set<string>();
        const usedTimes = new Map<string, number>();
        if (voucherIds.length) {
          const owned = await tx.userVoucher.findMany({ where: { userId, voucherId: { in: voucherIds } }, select: { voucherId: true } });
          const redeemed = await tx.voucherRedemption.groupBy({ by: ['voucherId'], where: { userId, voucherId: { in: voucherIds }, reversedAt: null }, _count: { _all: true } });
          for (const u of owned) held.add(u.voucherId);
          for (const g of redeemed) usedTimes.set(g.voucherId, g._count._all);
        }
        // A voucher can't be won when checkout would refuse it (switched off, expired, fully used, or this
        // shopper's own limit used up), nor when the shopper already holds it: either way the prize would
        // be used up and give them nothing new.
        const usable = (r: (typeof rewards)[number]) =>
          winnable(r.voucher, now) && !!r.voucherId && !held.has(r.voucherId) && (usedTimes.get(r.voucherId) ?? 0) < r.voucher!.perUserLimit;
        let pool = rewards.filter((r) => inStock(r) && (r.kind !== 'VOUCHER' || usable(r)));
        let chosen: (typeof rewards)[number] | null = null;
        while (pool.length && !chosen) {
          const total = pool.reduce((s, r) => s + r.weight, 0);
          let roll = Math.random() * total;
          const r = pool.find((x) => (roll -= x.weight) < 0) ?? pool[pool.length - 1];
          // Conditional increment: under concurrency only as many plays as the stock allows can win it, and
          // only while its prize is still the one read above (an admin edit in between makes it re-pick).
          // The stock is compared as stored at the moment of writing, not as read above, so a lowered stock holds.
          const claimed = await tx.campaignReward.updateMany({
            where: {
              id: r.id,
              kind: r.kind,
              voucherId: r.voucherId,
              coins: r.coins,
              OR: [{ stock: null }, { givenCount: { lt: this.prisma.campaignReward.fields.stock } }],
            },
            data: { givenCount: { increment: 1 } },
          });
          if (claimed.count === 1) chosen = r;
          else pool = pool.filter((x) => x.id !== r.id);
        }
        if (chosen?.kind === 'VOUCHER' && chosen.voucherId) {
          await tx.userVoucher.upsert({
            where: { userId_voucherId: { userId, voucherId: chosen.voucherId } },
            create: { userId, voucherId: chosen.voucherId },
            update: {},
          });
        }
        if (chosen?.kind === 'COINS' && chosen.coins) {
          await this.engagement.credit(tx, userId, chosen.coins, CoinReason.CAMPAIGN_REWARD, c.title, c.id);
        }
        await tx.campaignPlay.update({ where: { id: play.id }, data: { rewardId: chosen?.id ?? null } });
        if (chosen && chosen.kind !== 'NONE') {
          await this.engagement.notify(tx, userId, {
            type: 'promo',
            title: `${c.title}: আপনি জিতেছেন ${chosen.label}`,
            body: chosen.kind === 'VOUCHER' ? 'ভাউচারটি আপনার ভাউচার তালিকায় যোগ হয়েছে।' : 'কয়েন আপনার অ্যাকাউন্টে যোগ হয়েছে।',
            link: chosen.kind === 'VOUCHER' ? '/account/vouchers' : '/account/coins',
          });
        }
        return { reward: this.result(chosen) };
      }, { maxWait: 10_000, timeout: 15_000 });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('আজ আপনি খেলেছেন — কাল আবার আসুন');
      }
      // The campaign was deleted while this play was starting.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') throw new NotFoundException('এই অফারটি আর নেই');
      throw err;
    }
  }

  // ───── Admin helpers ─────

  async full(id: string, db: Db = this.prisma) {
    const c = await db.campaign.findUnique({ where: { id }, include: FULL_INCLUDE });
    if (!c) throw new NotFoundException('Campaign not found');
    return c;
  }

  includeFull() {
    return FULL_INCLUDE;
  }
}
