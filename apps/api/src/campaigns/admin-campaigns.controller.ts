import { BadRequestException, Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Query } from '@nestjs/common';
import { CampaignTheme, GameStyle, Permission, Prisma, RewardKind } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Audit, SkipAudit } from '../common/audit';
import { Perm } from '../common/auth';
import { variantLabel } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignInput, campaignStatus, CampaignsService, toInput } from './campaigns.service';

const HOUR = 3_600_000;
const LINK = /^(\/(?!\/)|https:\/\/)\S*$/;

class TickerDto {
  @IsString() @MinLength(1) @MaxLength(120) text: string;
  @IsOptional() @IsString() @MaxLength(300) @Matches(LINK, { message: 'Links start with / or https://' }) href?: string | null;
}

class RewardDto {
  @IsOptional() @IsString() id?: string;
  @IsEnum(RewardKind) kind: RewardKind;
  @IsOptional() @IsString() voucherId?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(10000) coins?: number | null;
  @IsString() @MinLength(1) @MaxLength(40) label: string;
  @IsInt() @Min(1) @Max(10000) weight: number;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000) stock?: number | null;
}

class CampaignDto {
  @IsString() @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: 'Use lowercase letters, numbers and dashes for the slug' }) @MaxLength(60) slug: string;
  @IsString() @MinLength(2) @MaxLength(80) title: string;
  @IsOptional() @IsString() @MaxLength(140) tagline?: string | null;
  @IsEnum(CampaignTheme) theme: CampaignTheme;
  @IsOptional() @IsString() @MaxLength(500) heroImageUrl?: string | null;
  @IsString() @MinLength(1) @MaxLength(30) ctaLabel: string;
  @IsString() @MaxLength(300) @Matches(LINK, { message: 'The button link starts with / or https://' }) ctaHref: string;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsInt() @Min(0) @Max(168) teaserHours: number;
  @IsInt() @Min(-100) @Max(100) priority: number;
  @IsBoolean() confetti: boolean;
  @IsBoolean() gameEnabled: boolean;
  @IsEnum(GameStyle) gameStyle: GameStyle;
  @IsBoolean() isActive: boolean;
  @IsOptional() @IsString() voucherId?: string | null;
  @IsOptional() @IsString() flashSaleId?: string | null;
  @IsArray() @ArrayMaxSize(24) @IsString({ each: true }) productIds: string[];
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => TickerDto) ticker: TickerDto[];
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => RewardDto) rewards: RewardDto[];
}

class PreviewDto extends CampaignDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsDateString() at?: string;
}

@Perm(Permission.MARKETING)
@Controller('admin/campaigns')
export class AdminCampaignsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaigns: CampaignsService,
  ) {}

  @Get()
  async list() {
    const now = new Date();
    const rows = await this.prisma.campaign.findMany({
      orderBy: [{ startsAt: 'desc' }],
      include: { _count: { select: { plays: true } } },
    });
    return rows.map((c) => ({
      id: c.id,
      slug: c.slug,
      title: c.title,
      theme: c.theme,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      teaserHours: c.teaserHours,
      priority: c.priority,
      isActive: c.isActive,
      gameEnabled: c.gameEnabled,
      gameStyle: c.gameStyle,
      plays: c._count.plays,
      status: campaignStatus(c, now),
    }));
  }

  /** Product search for the deals picker. Lives here so Marketing staff don't need the Catalog permission. */
  @Get('products')
  async products(@Query('q') q?: string) {
    const term = q?.trim();
    if (!term) return { items: [], total: 0 };
    const rows = await this.prisma.productVariant.findMany({
      where: {
        product: { status: { not: 'ARCHIVED' } },
        OR: [{ sku: { contains: term, mode: 'insensitive' } }, { product: { title: { contains: term, mode: 'insensitive' } } }],
      },
      include: { product: { select: { id: true, title: true, slug: true, images: { take: 1, orderBy: { sortOrder: 'asc' } } } } },
      orderBy: [{ isActive: 'desc' }, { sku: 'asc' }],
      take: 30,
    });
    return {
      total: rows.length,
      items: rows.map((v) => ({
        id: v.id,
        sku: v.sku,
        label: variantLabel(v.options),
        isActive: v.isActive,
        price: v.salePrice ?? v.price,
        regularPrice: v.price,
        salePrice: v.salePrice,
        product: { id: v.product.id, title: v.product.title, slug: v.product.slug, image: v.product.images[0]?.url ?? null },
      })),
    };
  }

  /** Form data for the editor, with enough product detail to show the picked deals. */
  @Get(':id')
  async one(@Param('id') id: string) {
    const c = await this.campaigns.full(id);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: c.products.map((p) => p.variantId) } },
      include: { product: { select: { title: true, images: { take: 1, orderBy: { sortOrder: 'asc' } } } } },
    });
    return {
      ...c,
      status: campaignStatus(c),
      products: c.products.map((p) => {
        const v = variants.find((x) => x.id === p.variantId);
        return {
          variantId: p.variantId,
          sku: v?.sku ?? '',
          title: v?.product.title ?? 'Deleted product',
          variantLabel: v ? variantLabel(v.options) : null,
          price: v ? (v.salePrice ?? v.price) : 0,
          image: v?.imageUrl ?? v?.product.images[0]?.url ?? null,
          isActive: v?.isActive ?? false,
        };
      }),
    };
  }

  @Audit({ action: 'campaign.create', entity: 'campaign', summary: ({ body }) => `Created campaign "${body.title}"` })
  @Post()
  async create(@Body() dto: CampaignDto) {
    await this.check(dto);
    try {
      return await this.prisma.campaign.create({
        data: {
          ...this.fields(dto),
          products: { create: dto.productIds.map((variantId, i) => ({ variantId, sortOrder: i })) },
          ticker: { create: dto.ticker.map((t, i) => ({ text: t.text.trim(), href: t.href?.trim() || null, sortOrder: i })) },
          rewards: { create: dto.rewards.map((r, i) => this.rewardData(r, i)) },
        },
      });
    } catch (err) {
      throw this.friendly(err);
    }
  }

  @Audit({ action: 'campaign.update', entity: 'campaign', summary: ({ body }) => `Updated campaign "${body.title}"` })
  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: CampaignDto) {
    await this.check(dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await this.campaigns.full(id, tx);
        // Rewards keep their ids so stock already handed out stays counted.
        const keep = new Set(dto.rewards.map((r) => r.id).filter(Boolean));
        // A play can win a reward while this runs, so each write re-checks the award count at the moment of
        // writing: removing a reward or changing its prize needs it still unwon, and a stock can't drop below
        // what has been won by then. (The play's claim re-checks the prize and the stored stock the same way.)
        const justWon = (label: string) =>
          new BadRequestException(`"${label}" was just won by a shopper while you were editing. Reload the page to see the latest numbers, then save again.`);
        for (const old of existing.rewards.filter((r) => !keep.has(r.id))) {
          if (old.givenCount > 0) throw new BadRequestException(`"${old.label}" has already been won ${old.givenCount} times, so it can't be removed. Set its weight to 1 or its stock to ${old.givenCount} instead.`);
          const removed = await tx.campaignReward.deleteMany({ where: { id: old.id, givenCount: 0 } });
          if (removed.count !== 1) throw justWon(old.label);
        }
        for (const [i, r] of dto.rewards.entries()) {
          const current = r.id ? existing.rewards.find((x) => x.id === r.id) : undefined;
          if (r.id && !current) throw new BadRequestException('One of the rewards no longer exists. Reload the page.');
          if (current && r.stock != null && r.stock < current.givenCount) {
            throw new BadRequestException(`Stock for "${r.label}" can't go below the ${current.givenCount} already won`);
          }
          // Plays point at this reward, so once it has been won its prize stays what those shoppers got.
          const next = this.rewardData(r, i);
          const newPrize = !!current && (next.kind !== current.kind || next.voucherId !== current.voucherId || next.coins !== current.coins);
          if (current && newPrize && current.givenCount > 0) {
            throw new BadRequestException(
              `"${current.label}" has already been won ${current.givenCount} times, so its prize can't change. Add a new reward for the new prize, and set this one's stock to ${current.givenCount} to stop it.`,
            );
          }
          if (current) {
            const awarded = newPrize ? { givenCount: 0 } : next.stock != null ? { givenCount: { lte: next.stock } } : {};
            const changed = await tx.campaignReward.updateMany({ where: { id: current.id, ...awarded }, data: next });
            if (changed.count !== 1) throw justWon(current.label);
          } else await tx.campaignReward.create({ data: { ...next, campaignId: id } });
        }
        await tx.campaignProduct.deleteMany({ where: { campaignId: id } });
        await tx.campaignTickerItem.deleteMany({ where: { campaignId: id } });
        return tx.campaign.update({
          where: { id },
          data: {
            ...this.fields(dto),
            products: { create: dto.productIds.map((variantId, i) => ({ variantId, sortOrder: i })) },
            ticker: { create: dto.ticker.map((t, i) => ({ text: t.text.trim(), href: t.href?.trim() || null, sortOrder: i })) },
          },
        });
      });
    } catch (err) {
      throw this.friendly(err);
    }
  }

  /** Campaigns that were played are switched off instead, so their history stays. */
  @Audit({ action: 'campaign.delete', entity: 'campaign', summary: ({ result }) => (result?.deactivated ? 'Turned off a played campaign' : 'Deleted a campaign') })
  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.prisma.$transaction(async (tx) => {
      // Lock the campaign first: a play's insert needs a share lock on it, so a first play can't slip in
      // between the check and the delete (it either finishes first and is counted, or waits and then fails).
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Campaign" WHERE id = ${id} FOR UPDATE`;
      if (!locked.length) throw new NotFoundException('Campaign not found');
      const plays = await tx.campaignPlay.count({ where: { campaignId: id } });
      if (plays) {
        await tx.campaign.update({ where: { id }, data: { isActive: false } });
        return { ok: true, deactivated: true };
      }
      await tx.campaign.delete({ where: { id } });
      return { ok: true };
    });
  }

  /** An inactive copy that starts a week after the original (or a week from now), same length. */
  @Audit({ action: 'campaign.duplicate', entity: 'campaign', summary: ({ result }) => `Duplicated a campaign as "${result?.title}"` })
  @Post(':id/duplicate')
  async duplicate(@Param('id') id: string) {
    const c = await this.campaigns.full(id);
    const length = c.endsAt.getTime() - c.startsAt.getTime();
    const start = new Date(Math.max(c.startsAt.getTime(), Date.now()) + 7 * 24 * HOUR);
    // Shorten the original before adding the suffix, so long slugs still get distinct candidates.
    const withSuffix = (suffix: string) => `${c.slug.slice(0, 60 - suffix.length).replace(/-+$/, '')}${suffix}`;
    let slug = withSuffix('-copy');
    for (let n = 2; await this.prisma.campaign.findUnique({ where: { slug } }); n++) slug = withSuffix(`-copy-${n}`);
    return this.prisma.campaign.create({
      data: {
        slug,
        title: `${c.title} (কপি)`.slice(0, 80),
        tagline: c.tagline,
        theme: c.theme,
        heroImageUrl: c.heroImageUrl,
        ctaLabel: c.ctaLabel,
        ctaHref: c.ctaHref,
        startsAt: start,
        endsAt: new Date(start.getTime() + length),
        teaserHours: c.teaserHours,
        priority: c.priority,
        confetti: c.confetti,
        gameEnabled: c.gameEnabled,
        gameStyle: c.gameStyle,
        isActive: false,
        voucherId: c.voucherId,
        flashSaleId: c.flashSaleId,
        products: { create: c.products.map((p) => ({ variantId: p.variantId, sortOrder: p.sortOrder })) },
        ticker: { create: c.ticker.map((t) => ({ text: t.text, href: t.href, sortOrder: t.sortOrder })) },
        rewards: { create: c.rewards.map((r) => ({ kind: r.kind, voucherId: r.voucherId, coins: r.coins, label: r.label, weight: r.weight, stock: r.stock, sortOrder: r.sortOrder })) },
      },
    });
  }

  /** Plays per day, rewards against stock, voucher collects and orders that used the voucher. Counts only, no money. */
  @Get(':id/stats')
  async stats(@Param('id') id: string) {
    const c = await this.campaigns.full(id);
    const [perDay, players, collects, orders] = await Promise.all([
      this.prisma.campaignPlay.groupBy({ by: ['playDay'], where: { campaignId: id }, _count: { _all: true }, orderBy: { playDay: 'asc' } }),
      this.prisma.campaignPlay.groupBy({ by: ['userId'], where: { campaignId: id } }).then((r) => r.length),
      c.voucherId
        ? this.prisma.userVoucher.count({ where: { voucherId: c.voucherId, collectedAt: { gte: new Date(c.startsAt.getTime() - c.teaserHours * HOUR), lte: c.endsAt } } })
        : 0,
      c.voucherId
        ? this.prisma.voucherRedemption.count({ where: { voucherId: c.voucherId, reversedAt: null, createdAt: { gte: c.startsAt, lte: c.endsAt } } })
        : 0,
    ]);
    return {
      plays: perDay.reduce((s, d) => s + d._count._all, 0),
      players,
      playsPerDay: perDay.map((d) => ({ day: d.playDay, plays: d._count._all })),
      rewards: c.rewards.map((r) => ({ id: r.id, label: r.label, kind: r.kind, givenCount: r.givenCount, stock: r.stock })),
      voucherCollects: collects,
      voucherOrders: orders,
    };
  }

  /** What the storefront would show for this form data at a given time. Changes nothing. */
  @SkipAudit()
  @HttpCode(200)
  @Post('preview')
  async preview(@Body() dto: PreviewDto) {
    const existing = dto.id ? await this.prisma.campaign.findUnique({ where: { id: dto.id }, include: this.campaigns.includeFull() }) : null;
    const given = new Map((existing?.rewards ?? []).map((r) => [r.id, r.givenCount]));
    const input: CampaignInput = {
      ...(existing ? toInput(existing) : ({} as CampaignInput)),
      ...this.fields(dto),
      id: dto.id ?? 'preview',
      productIds: dto.productIds,
      ticker: dto.ticker.map((t) => ({ text: t.text, href: t.href ?? null })),
      rewards: dto.rewards.map((r, i) => ({
        id: r.id ?? `new-${i}`,
        kind: r.kind,
        voucherId: r.kind === 'VOUCHER' ? r.voucherId || null : null,
        label: r.label,
        weight: r.weight,
        stock: r.stock ?? null,
        givenCount: (r.id && given.get(r.id)) || 0,
        sortOrder: i,
      })),
    };
    if (input.endsAt <= input.startsAt) throw new BadRequestException('The end time must be after the start time');
    const at = dto.at ? new Date(dto.at) : new Date();
    // Shown as if switched on, so a draft can be previewed; before the teaser and after the end the store shows nothing.
    const status = campaignStatus({ ...input, isActive: true }, at);
    if (status === 'SCHEDULED' || status === 'ENDED') return { serverNow: at, campaign: null, status };
    return { serverNow: at, campaign: await this.campaigns.view(input, at), status };
  }

  private fields(dto: CampaignDto) {
    return {
      slug: dto.slug,
      title: dto.title.trim(),
      tagline: dto.tagline?.trim() || null,
      theme: dto.theme,
      heroImageUrl: dto.heroImageUrl?.trim() || null,
      ctaLabel: dto.ctaLabel.trim(),
      ctaHref: dto.ctaHref.trim(),
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
      teaserHours: dto.teaserHours,
      priority: dto.priority,
      confetti: dto.confetti,
      gameEnabled: dto.gameEnabled,
      gameStyle: dto.gameStyle,
      isActive: dto.isActive,
      voucherId: dto.voucherId || null,
      flashSaleId: dto.flashSaleId || null,
    };
  }

  private rewardData(r: RewardDto, sortOrder: number) {
    return {
      kind: r.kind,
      voucherId: r.kind === 'VOUCHER' ? r.voucherId! : null,
      coins: r.kind === 'COINS' ? r.coins! : null,
      label: r.label.trim(),
      weight: r.weight,
      stock: r.stock ?? null,
      sortOrder,
    };
  }

  /**
   * Checks a campaign before saving. Linked records must always exist. Whether they are still valid
   * (active, collectible, overlapping the dates) and the game's reward count are only checked when the
   * campaign is switched on, so turning a campaign off always works even if a voucher changed since.
   */
  private async check(dto: CampaignDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    const active = dto.isActive;
    const overlaps = (s: Date, e: Date) => s < endsAt && e > startsAt;
    if (endsAt <= startsAt) throw new BadRequestException('The end time must be after the start time');
    if (dto.rewards.some((r) => r.kind === 'VOUCHER' && !r.voucherId)) throw new BadRequestException('Pick the voucher for each voucher reward');
    if (dto.rewards.some((r) => r.kind === 'COINS' && !r.coins)) throw new BadRequestException('Enter how many coins each coin reward gives');
    if (new Set(dto.productIds).size !== dto.productIds.length) throw new BadRequestException('Each product can be picked once');

    if (dto.voucherId) {
      const v = await this.prisma.voucher.findUnique({ where: { id: dto.voucherId } });
      if (!v) throw new BadRequestException('The voucher to collect no longer exists');
      if (active && (!v.isActive || !v.isCollectible)) throw new BadRequestException(`Voucher ${v.code} must be active and collectible to show on the banner`);
      if (active && !overlaps(v.startsAt, v.endsAt)) throw new BadRequestException(`Voucher ${v.code} isn't valid at any time during this campaign`);
    }
    if (dto.flashSaleId) {
      const s = await this.prisma.flashSale.findUnique({ where: { id: dto.flashSaleId } });
      if (!s) throw new BadRequestException('The linked flash sale no longer exists');
      if (active && !overlaps(s.startsAt, s.endsAt)) throw new BadRequestException(`Flash sale "${s.title}" doesn't run at any time during this campaign`);
    }
    if (dto.productIds.length) {
      const found = await this.prisma.productVariant.count({ where: { id: { in: dto.productIds } } });
      if (found !== dto.productIds.length) throw new BadRequestException('One of the picked products no longer exists');
    }
    if (active && dto.gameEnabled) {
      if (dto.gameStyle === 'SPIN_WHEEL' && (dto.rewards.length < 4 || dto.rewards.length > 10)) throw new BadRequestException('A spin wheel needs 4 to 10 rewards');
      if (dto.rewards.length < 2) throw new BadRequestException('The daily game needs at least 2 rewards');
    }
    const voucherIds = dto.rewards.filter((r) => r.kind === 'VOUCHER').map((r) => r.voucherId as string);
    if (voucherIds.length) {
      const vouchers = await this.prisma.voucher.findMany({ where: { id: { in: voucherIds } } });
      for (const id of voucherIds) {
        const v = vouchers.find((x) => x.id === id);
        if (!v) throw new BadRequestException('A voucher used as a reward no longer exists');
        if (active && !v.isActive) throw new BadRequestException(`Voucher ${v.code} is switched off, so it can't be a reward`);
        if (active && !overlaps(v.startsAt, v.endsAt)) throw new BadRequestException(`Voucher ${v.code} isn't valid at any time during this campaign`);
      }
    }
  }

  private friendly(err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new BadRequestException('Another campaign already uses that slug');
    }
    return err;
  }
}
