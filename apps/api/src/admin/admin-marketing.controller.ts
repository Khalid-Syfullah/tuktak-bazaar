import { BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { BannerPlacement, Permission, Prisma, VoucherType } from '@prisma/client';
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
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Perm } from '../common/auth';
import { variantLabel } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';

class VoucherDto {
  @IsString() @MinLength(3) @MaxLength(30) code: string;
  @IsString() @MinLength(2) @MaxLength(80) title: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string | null;
  @IsEnum(VoucherType) type: VoucherType;
  @IsInt() @Min(0) value: number;
  @IsOptional() @IsInt() @Min(1) maxDiscount?: number | null;
  @IsInt() @Min(0) minSpend: number;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsOptional() @IsInt() @Min(1) usageLimit?: number | null;
  @IsInt() @Min(1) @Max(100) perUserLimit: number;
  @IsBoolean() isActive: boolean;
  @IsBoolean() isCollectible: boolean;
}

class FlashItemDto {
  @IsString() variantId: string;
  @IsInt() @Min(1) flashPrice: number;
  @IsInt() @Min(1) quantityLimit: number;
  @IsInt() @Min(1) @Max(20) perUserLimit: number;
}

class FlashSaleDto {
  @IsString() @MinLength(2) @MaxLength(80) title: string;
  @IsDateString() startsAt: string;
  @IsDateString() endsAt: string;
  @IsBoolean() isActive: boolean;
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => FlashItemDto) items: FlashItemDto[];
}

class BannerDto {
  @IsString() @MinLength(2) @MaxLength(80) title: string;
  @IsOptional() @IsString() @MaxLength(160) subtitle?: string | null;
  @IsString() imageUrl: string;
  @IsString() @MaxLength(300) link: string;
  @IsEnum(BannerPlacement) placement: BannerPlacement;
  @IsInt() sortOrder: number;
  @IsBoolean() isActive: boolean;
  @IsOptional() @IsDateString() startsAt?: string | null;
  @IsOptional() @IsDateString() endsAt?: string | null;
}

@Perm(Permission.MARKETING)
@Controller('admin')
export class AdminMarketingController {
  constructor(private readonly prisma: PrismaService) {}

  // ───── Vouchers ─────

  @Get('vouchers')
  async vouchers() {
    const rows = await this.prisma.voucher.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { collectedBy: true } } },
    });
    return rows.map(({ _count, ...v }) => ({ ...v, collectedCount: _count.collectedBy }));
  }

  @Post('vouchers')
  async createVoucher(@Body() dto: VoucherDto) {
    const data = this.voucherData(dto);
    if (await this.prisma.voucher.findUnique({ where: { code: data.code } })) throw new BadRequestException('That code is already in use');
    return this.prisma.voucher.create({ data });
  }

  @Patch('vouchers/:id')
  async updateVoucher(@Param('id') id: string, @Body() dto: VoucherDto) {
    const data = this.voucherData(dto);
    const clash = await this.prisma.voucher.findFirst({ where: { code: data.code, NOT: { id } } });
    if (clash) throw new BadRequestException('That code is already in use');
    return this.prisma.voucher.update({ where: { id }, data });
  }

  @Delete('vouchers/:id')
  async deleteVoucher(@Param('id') id: string) {
    // A voucher that was used, or that a campaign reward hands out, is switched off instead so its history stays
    // (switched off, it can no longer be won either).
    const switchOff = async (reason: 'used' | 'campaign') => {
      await this.prisma.voucher.update({ where: { id }, data: { isActive: false } });
      return { ok: true, deactivated: true, reason };
    };
    const [used, rewards] = await Promise.all([
      this.prisma.voucherRedemption.count({ where: { voucherId: id } }),
      this.prisma.campaignReward.count({ where: { voucherId: id } }),
    ]);
    if (used) return switchOff('used');
    if (rewards) return switchOff('campaign');
    try {
      await this.prisma.voucher.delete({ where: { id } });
    } catch (err) {
      // A campaign reward started using it a moment ago.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') return switchOff('campaign');
      throw err;
    }
    return { ok: true };
  }

  private voucherData(dto: VoucherDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt) throw new BadRequestException('The end date must be after the start date');
    if (dto.type === 'PERCENT' && (dto.value < 1 || dto.value > 90)) throw new BadRequestException('Percent vouchers take 1–90%');
    if (dto.type === 'FIXED' && dto.value < 1) throw new BadRequestException('Enter the discount in taka');
    return {
      code: dto.code.trim().toUpperCase().replace(/\s+/g, ''),
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      type: dto.type,
      value: dto.type === 'FREE_SHIPPING' ? 0 : dto.value,
      maxDiscount: dto.type === 'PERCENT' ? (dto.maxDiscount ?? null) : null,
      minSpend: dto.minSpend,
      startsAt,
      endsAt,
      usageLimit: dto.usageLimit ?? null,
      perUserLimit: dto.perUserLimit,
      isActive: dto.isActive,
      isCollectible: dto.isCollectible,
    };
  }

  // ───── Flash sales ─────

  @Get('flash-sales')
  async flashSales() {
    const rows = await this.prisma.flashSale.findMany({
      orderBy: { startsAt: 'desc' },
      include: {
        items: { include: { variant: { include: { product: { select: { title: true, images: { take: 1, orderBy: { sortOrder: 'asc' } } } } } } } },
      },
    });
    return rows.map((s) => ({
      ...s,
      items: s.items.map((i) => ({
        id: i.id,
        variantId: i.variantId,
        flashPrice: i.flashPrice,
        quantityLimit: i.quantityLimit,
        soldQty: i.soldQty,
        perUserLimit: i.perUserLimit,
        sku: i.variant.sku,
        title: i.variant.product.title,
        variantLabel: variantLabel(i.variant.options),
        price: i.variant.salePrice ?? i.variant.price,
        mrp: i.variant.price,
        stock: i.variant.stock,
        image: i.variant.product.images[0]?.url ?? null,
      })),
    }));
  }

  @Get('flash-sales/:id')
  async flashSale(@Param('id') id: string) {
    const sale = (await this.flashSales()).find((s) => s.id === id);
    if (!sale) throw new NotFoundException('Flash sale not found');
    return sale;
  }

  @Post('flash-sales')
  async createFlashSale(@Body() dto: FlashSaleDto) {
    await this.checkFlash(dto);
    return this.prisma.flashSale.create({
      data: {
        title: dto.title.trim(),
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        isActive: dto.isActive,
        items: { create: dto.items },
      },
    });
  }

  @Patch('flash-sales/:id')
  async updateFlashSale(@Param('id') id: string, @Body() dto: FlashSaleDto) {
    await this.checkFlash(dto);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.flashSaleItem.findMany({ where: { flashSaleId: id } });
      const wanted = new Set(dto.items.map((i) => i.variantId));
      for (const old of existing.filter((e) => !wanted.has(e.variantId))) {
        if (old.soldQty > 0) throw new BadRequestException('Items that already sold in this flash sale cannot be removed');
        await tx.flashSaleItem.delete({ where: { id: old.id } });
      }
      for (const item of dto.items) {
        const current = existing.find((e) => e.variantId === item.variantId);
        if (current && item.quantityLimit < current.soldQty) {
          throw new BadRequestException(`Stock cap can't go below the ${current.soldQty} already sold`);
        }
        await tx.flashSaleItem.upsert({
          where: { flashSaleId_variantId: { flashSaleId: id, variantId: item.variantId } },
          create: { ...item, flashSaleId: id },
          update: { flashPrice: item.flashPrice, quantityLimit: item.quantityLimit, perUserLimit: item.perUserLimit },
        });
      }
      return tx.flashSale.update({
        where: { id },
        data: { title: dto.title.trim(), startsAt: new Date(dto.startsAt), endsAt: new Date(dto.endsAt), isActive: dto.isActive },
      });
    });
  }

  @Delete('flash-sales/:id')
  async deleteFlashSale(@Param('id') id: string) {
    const sold = await this.prisma.flashSaleItem.count({ where: { flashSaleId: id, soldQty: { gt: 0 } } });
    if (sold) {
      await this.prisma.flashSale.update({ where: { id }, data: { isActive: false } });
      return { ok: true, deactivated: true };
    }
    await this.prisma.flashSale.delete({ where: { id } });
    return { ok: true };
  }

  private async checkFlash(dto: FlashSaleDto) {
    if (new Date(dto.endsAt) <= new Date(dto.startsAt)) throw new BadRequestException('The end time must be after the start time');
    const ids = dto.items.map((i) => i.variantId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Each variant can appear once per flash sale');
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: ids } } });
    for (const item of dto.items) {
      const v = variants.find((x) => x.id === item.variantId);
      if (!v) throw new BadRequestException('One of the variants no longer exists');
      if (item.flashPrice >= (v.salePrice ?? v.price)) throw new BadRequestException(`Flash price for ${v.sku} must be below its current price`);
    }
  }

  // ───── Banners ─────

  @Get('banners')
  banners() {
    return this.prisma.banner.findMany({ orderBy: [{ placement: 'asc' }, { sortOrder: 'asc' }] });
  }

  @Post('banners')
  createBanner(@Body() dto: BannerDto) {
    return this.prisma.banner.create({ data: this.bannerData(dto) });
  }

  @Patch('banners/:id')
  updateBanner(@Param('id') id: string, @Body() dto: BannerDto) {
    return this.prisma.banner.update({ where: { id }, data: this.bannerData(dto) });
  }

  @Delete('banners/:id')
  async deleteBanner(@Param('id') id: string) {
    await this.prisma.banner.delete({ where: { id } });
    return { ok: true };
  }

  private bannerData(dto: BannerDto) {
    return {
      title: dto.title.trim(),
      subtitle: dto.subtitle?.trim() || null,
      imageUrl: dto.imageUrl,
      link: dto.link || '/',
      placement: dto.placement,
      sortOrder: dto.sortOrder,
      isActive: dto.isActive,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
    };
  }
}
