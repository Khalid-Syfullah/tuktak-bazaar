import { Injectable } from '@nestjs/common';
import { FlashSale, FlashSaleItem, Product, ProductImage, ProductVariant } from '@prisma/client';
import { Db, PrismaService } from '../prisma/prisma.service';

export type ActiveFlash = FlashSaleItem & { flashSale: FlashSale };

export interface PriceInfo {
  unitPrice: number;
  /** MRP shown struck through */
  originalPrice: number;
  discountPct: number;
  flash: ActiveFlash | null;
}

export interface ProductCard {
  id: string;
  slug: string;
  title: string;
  image: string | null;
  brand: string | null;
  price: number;
  originalPrice: number;
  discountPct: number;
  ratingAvg: number;
  ratingCount: number;
  soldCount: number;
  inStock: boolean;
  flash: boolean;
}

export type CardProduct = Product & {
  images: ProductImage[];
  variants: ProductVariant[];
  brand?: { name: string } | null;
};

export const CARD_INCLUDE = {
  images: { orderBy: { sortOrder: 'asc' as const }, take: 1 },
  variants: { where: { isActive: true } },
  brand: { select: { name: true } },
};

export function pct(original: number, price: number): number {
  if (!original || price >= original) return 0;
  return Math.round(((original - price) / original) * 100);
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Flash-sale items running right now that still have stock under their cap. Cheapest wins on overlap. */
  /** Flash sales running at `now` (the real time, except in a campaign preview of another moment). */
  async activeFlash(variantIds: string[], db: Db = this.prisma, now = new Date()): Promise<Map<string, ActiveFlash>> {
    const map = new Map<string, ActiveFlash>();
    if (!variantIds.length) return map;
    const items = await db.flashSaleItem.findMany({
      where: {
        variantId: { in: variantIds },
        flashSale: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } },
      },
      include: { flashSale: true },
    });
    for (const item of items) {
      if (item.soldQty >= item.quantityLimit) continue;
      const current = map.get(item.variantId);
      if (!current || item.flashPrice < current.flashPrice) map.set(item.variantId, item);
    }
    return map;
  }

  price(variant: Pick<ProductVariant, 'price' | 'salePrice'>, flash?: ActiveFlash | null): PriceInfo {
    const regular = variant.salePrice ?? variant.price;
    const useFlash = !!flash && flash.flashPrice < regular;
    const unitPrice = useFlash ? flash!.flashPrice : regular;
    return {
      unitPrice,
      originalPrice: variant.price,
      discountPct: pct(variant.price, unitPrice),
      flash: useFlash ? flash! : null,
    };
  }

  card(product: CardProduct, flashMap: Map<string, ActiveFlash>): ProductCard {
    let best: PriceInfo | null = null;
    for (const v of product.variants) {
      const info = this.price(v, flashMap.get(v.id));
      if (!best || info.unitPrice < best.unitPrice) best = info;
    }
    return {
      id: product.id,
      slug: product.slug,
      title: product.title,
      image: product.images[0]?.url ?? null,
      brand: product.brand?.name ?? null,
      price: best?.unitPrice ?? 0,
      originalPrice: best?.originalPrice ?? 0,
      discountPct: best?.discountPct ?? 0,
      ratingAvg: Math.round(product.ratingAvg * 10) / 10,
      ratingCount: product.ratingCount,
      soldCount: product.soldCount,
      inStock: product.variants.some((v) => v.stock > 0),
      flash: !!best?.flash,
    };
  }

  async cards(products: CardProduct[]): Promise<ProductCard[]> {
    const flashMap = await this.activeFlash(products.flatMap((p) => p.variants.map((v) => v.id)));
    return products.map((p) => this.card(p, flashMap));
  }
}
