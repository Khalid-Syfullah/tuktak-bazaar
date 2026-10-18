import { Injectable, NotFoundException } from '@nestjs/common';
import { BannerPlacement, Category, DeliveryZone, Prisma } from '@prisma/client';
import { ZONE_LABELS } from '../common/locations';
import { CARD_INCLUDE, PricingService, ProductCard } from '../common/pricing.service';
import { SettingsService } from '../common/settings.service';
import { dhakaDay, variantLabel } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { SearchParams, SearchService } from './search.service';

export interface CategoryNode {
  id: string;
  name: string;
  nameBn: string | null;
  slug: string;
  icon: string | null;
  imageUrl: string | null;
  children: CategoryNode[];
}

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly search: SearchService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Categories are a small table (tens of rows), so they are read fresh on each request.
   * That keeps navigation correct right after admin edits or a re-seed without cache invalidation.
   */
  async allCategories(): Promise<Category[]> {
    return this.prisma.category.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  /** Kept for callers that changed categories; nothing is cached any more. */
  clearCategoryCache() {}

  async tree(): Promise<CategoryNode[]> {
    const list = await this.allCategories();
    const build = (parentId: string | null): CategoryNode[] =>
      list
        .filter((c) => c.parentId === parentId)
        .map((c) => ({ id: c.id, name: c.name, nameBn: c.nameBn, slug: c.slug, icon: c.icon, imageUrl: c.imageUrl, children: build(c.id) }));
    return build(null);
  }

  /** A category and all its descendants. */
  async descendantIds(categoryId: string): Promise<string[]> {
    const list = await this.allCategories();
    const out = [categoryId];
    for (let i = 0; i < out.length; i++) for (const c of list) if (c.parentId === out[i]) out.push(c.id);
    return out;
  }

  async breadcrumb(categoryId: string) {
    const list = await this.allCategories();
    const trail: { name: string; slug: string }[] = [];
    let current = list.find((c) => c.id === categoryId);
    while (current) {
      trail.unshift({ name: current.name, slug: current.slug });
      current = current.parentId ? list.find((c) => c.id === current!.parentId) : undefined;
    }
    return trail;
  }

  async categoryBySlug(slug: string) {
    const list = await this.allCategories();
    const cat = list.find((c) => c.slug === slug);
    if (!cat) throw new NotFoundException('Category not found');
    return {
      category: { id: cat.id, name: cat.name, nameBn: cat.nameBn, slug: cat.slug, imageUrl: cat.imageUrl },
      breadcrumb: await this.breadcrumb(cat.id),
      children: list.filter((c) => c.parentId === cat.id).map((c) => ({ name: c.name, slug: c.slug, icon: c.icon, imageUrl: c.imageUrl })),
    };
  }

  async cardsByIds(ids: string[]): Promise<ProductCard[]> {
    if (!ids.length) return [];
    const products = await this.prisma.product.findMany({ where: { id: { in: ids } }, include: CARD_INCLUDE });
    const cards = await this.pricing.cards(products);
    const byId = new Map(cards.map((c) => [c.id, c]));
    return ids.map((id) => byId.get(id)).filter((c): c is ProductCard => !!c);
  }

  async list(params: SearchParams & { categorySlug?: string }) {
    let categoryIds: string[] | undefined;
    if (params.categorySlug) {
      const cat = (await this.allCategories()).find((c) => c.slug === params.categorySlug);
      if (!cat) throw new NotFoundException('Category not found');
      categoryIds = await this.descendantIds(cat.id);
    }
    const query = { ...params, categoryIds };
    const [{ ids, total }, facets] = await Promise.all([this.search.search(query), this.search.facets(query)]);
    return {
      items: await this.cardsByIds(ids),
      total,
      page: params.page,
      pages: Math.max(1, Math.ceil(total / params.limit)),
      facets,
    };
  }

  async suggest(q: string) {
    const term = q.trim();
    if (term.length < 2) return { products: [], categories: [] };
    const { ids } = await this.search.search({ q: term, page: 1, limit: 6, sort: 'relevance' });
    const products = ids.length
      ? await this.prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, slug: true } })
      : [];
    const order = new Map(ids.map((id, i) => [id, i]));
    products.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    const lower = term.toLowerCase();
    const categories = (await this.allCategories())
      .filter((c) => c.name.toLowerCase().includes(lower) || (c.nameBn ?? '').includes(term))
      .slice(0, 3)
      .map((c) => ({ name: c.name, slug: c.slug }));
    return { products: products.map((p) => ({ title: p.title, slug: p.slug })), categories };
  }

  async currentFlashSale(limit?: number) {
    const now = new Date();
    const sale =
      (await this.prisma.flashSale.findFirst({
        where: { isActive: true, startsAt: { lte: now }, endsAt: { gt: now } },
        orderBy: { endsAt: 'asc' },
      })) ??
      (await this.prisma.flashSale.findFirst({ where: { isActive: true, startsAt: { gt: now } }, orderBy: { startsAt: 'asc' } }));
    if (!sale) return null;
    const live = sale.startsAt <= now;
    const items = await this.prisma.flashSaleItem.findMany({
      where: { flashSaleId: sale.id, variant: { isActive: true, product: { status: 'ACTIVE' } } },
      include: { variant: { include: { product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 1 } } } } } },
      orderBy: { soldQty: 'desc' },
      take: limit,
    });
    return {
      id: sale.id,
      title: sale.title,
      startsAt: sale.startsAt,
      endsAt: sale.endsAt,
      live,
      items: items.map((item) => ({
        productId: item.variant.productId,
        slug: item.variant.product.slug,
        title: item.variant.product.title,
        variantLabel: variantLabel(item.variant.options),
        image: item.variant.imageUrl ?? item.variant.product.images[0]?.url ?? null,
        flashPrice: item.flashPrice,
        originalPrice: item.variant.price,
        discountPct: Math.round(((item.variant.price - item.flashPrice) / item.variant.price) * 100),
        soldQty: item.soldQty,
        quantityLimit: item.quantityLimit,
        soldOut: item.soldQty >= item.quantityLimit || item.variant.stock <= 0,
      })),
    };
  }

  async home() {
    const now = new Date();
    const banners = await this.prisma.banner.findMany({
      where: {
        isActive: true,
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      orderBy: { sortOrder: 'asc' },
    });
    const seed = dhakaDay();
    const [flashSale, categories, justForYou, featured] = await Promise.all([
      this.currentFlashSale(12),
      this.tree(),
      this.list({ page: 1, limit: 24, sort: 'for_you', seed }),
      this.prisma.product.findMany({ where: { status: 'ACTIVE', isFeatured: true }, include: CARD_INCLUDE, take: 12 }),
    ]);
    return {
      heroBanners: banners.filter((b) => b.placement === BannerPlacement.HOME_HERO),
      stripBanners: banners.filter((b) => b.placement === BannerPlacement.HOME_STRIP),
      flashSale,
      categories,
      featured: await this.pricing.cards(featured),
      justForYou: { items: justForYou.items, pages: justForYou.pages, seed },
    };
  }

  async product(slug: string, userId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        variants: { where: { isActive: true }, orderBy: { createdAt: 'asc' } },
        brand: true,
        category: true,
      },
    });
    if (!product || product.status !== 'ACTIVE') throw new NotFoundException('This product is not available');

    const flashMap = await this.pricing.activeFlash(product.variants.map((v) => v.id));
    const variants = product.variants.map((v) => {
      const info = this.pricing.price(v, flashMap.get(v.id));
      return {
        id: v.id,
        sku: v.sku,
        options: v.options as Record<string, string>,
        label: variantLabel(v.options),
        imageUrl: v.imageUrl,
        stock: v.stock,
        price: info.unitPrice,
        originalPrice: info.originalPrice,
        discountPct: info.discountPct,
        flash: info.flash
          ? {
              endsAt: info.flash.flashSale.endsAt,
              title: info.flash.flashSale.title,
              soldQty: info.flash.soldQty,
              quantityLimit: info.flash.quantityLimit,
              perUserLimit: info.flash.perUserLimit,
            }
          : null,
      };
    });

    const settings = await this.settings.get();
    const zones = (Object.keys(settings.delivery.zones) as DeliveryZone[]).map((zone) => ({
      zone,
      label: ZONE_LABELS[zone],
      fee: settings.delivery.zones[zone].fee,
      days: settings.delivery.zones[zone].days,
    }));

    const wishlisted = userId
      ? !!(await this.prisma.wishlistItem.findUnique({ where: { userId_productId: { userId, productId: product.id } } }))
      : false;
    // "Notify me" alerts this customer is waiting on, per variant
    const myAlerts = userId
      ? await this.prisma.productAlert.findMany({
          where: { userId, productId: product.id, notifiedAt: null },
          select: { id: true, variantId: true, type: true },
        })
      : [];

    const now = new Date();
    const vouchers = await this.prisma.voucher.findMany({
      where: { isActive: true, isCollectible: true, startsAt: { lte: now }, endsAt: { gt: now } },
      orderBy: { minSpend: 'asc' },
      take: 6,
      include: userId ? { collectedBy: { where: { userId }, select: { id: true } } } : undefined,
    });

    return {
      id: product.id,
      slug: product.slug,
      title: product.title,
      description: product.description,
      highlights: product.highlights,
      optionNames: product.optionNames,
      specs: product.specs as { name: string; value: string }[],
      warranty: product.warranty,
      returnDays: product.returnDays,
      ratingAvg: Math.round(product.ratingAvg * 10) / 10,
      ratingCount: product.ratingCount,
      soldCount: product.soldCount,
      brand: product.brand ? { name: product.brand.name, slug: product.brand.slug } : null,
      category: { name: product.category.name, slug: product.category.slug },
      breadcrumb: await this.breadcrumb(product.categoryId),
      images: product.images.map((i) => ({ url: i.url, alt: i.alt })),
      variants,
      wishlisted,
      myAlerts,
      delivery: {
        zones,
        freeShippingThreshold: settings.delivery.freeShippingThreshold,
        codAvailable: settings.cod.enabled,
      },
      vouchers: vouchers.map((v) => ({
        id: v.id,
        code: v.code,
        title: v.title,
        type: v.type,
        value: v.value,
        maxDiscount: v.maxDiscount,
        minSpend: v.minSpend,
        endsAt: v.endsAt,
        collected: 'collectedBy' in v ? (v as unknown as { collectedBy: unknown[] }).collectedBy.length > 0 : false,
      })),
    };
  }

  async related(slug: string) {
    const product = await this.prisma.product.findUnique({ where: { slug }, select: { id: true, categoryId: true, brandId: true } });
    if (!product) throw new NotFoundException('Product not found');
    const where: Prisma.ProductWhereInput = { status: 'ACTIVE', id: { not: product.id } };
    const sameCategory = await this.prisma.product.findMany({
      where: { ...where, categoryId: product.categoryId },
      include: CARD_INCLUDE,
      orderBy: { soldCount: 'desc' },
      take: 12,
    });
    let items = sameCategory;
    if (items.length < 6) {
      const parent = (await this.allCategories()).find((c) => c.id === product.categoryId)?.parentId;
      if (parent) {
        const ids = await this.descendantIds(parent);
        const more = await this.prisma.product.findMany({
          where: { ...where, categoryId: { in: ids }, id: { notIn: [product.id, ...items.map((i) => i.id)] } },
          include: CARD_INCLUDE,
          orderBy: { soldCount: 'desc' },
          take: 12 - items.length,
        });
        items = [...items, ...more];
      }
    }
    return this.pricing.cards(items);
  }
}
