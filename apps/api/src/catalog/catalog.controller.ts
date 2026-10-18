import { Controller, Get, Param, Query } from '@nestjs/common';
import { DeliveryZone } from '@prisma/client';
import { AuthUser, CurrentUser, Public } from '../common/auth';
import { DHAKA_AREAS, DIVISIONS, ZONE_LABELS, zoneForDistrict } from '../common/locations';
import { SettingsService } from '../common/settings.service';
import { clamp, toInt } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogService } from './catalog.service';
import { SortKey } from './search.service';

const SORTS: SortKey[] = ['relevance', 'popular', 'newest', 'price_asc', 'price_desc', 'rating', 'for_you'];

export function listParams(query: Record<string, string | undefined>) {
  const num = (v?: string) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined);
  return {
    q: query.q?.slice(0, 100) || undefined,
    categorySlug: query.category || undefined,
    brandSlugs: query.brand ? query.brand.split(',').filter(Boolean).slice(0, 20) : undefined,
    minPrice: num(query.minPrice),
    maxPrice: num(query.maxPrice),
    minRating: num(query.rating),
    sort: SORTS.includes(query.sort as SortKey) ? (query.sort as SortKey) : 'relevance',
    page: clamp(toInt(query.page, 1), 1, 500),
    limit: clamp(toInt(query.limit, 24), 1, 60),
  };
}

@Public()
@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  @Get('home')
  home() {
    return this.catalog.home();
  }

  @Get('categories')
  async categories() {
    return this.catalog.tree();
  }

  @Get('categories/:slug')
  category(@Param('slug') slug: string) {
    return this.catalog.categoryBySlug(slug);
  }

  @Get('brands')
  brands() {
    return this.prisma.brand.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true, slug: true, logoUrl: true } });
  }

  @Get('products')
  products(@Query() query: Record<string, string>) {
    return this.catalog.list(listParams(query));
  }

  @Get('products/:slug')
  product(@Param('slug') slug: string, @CurrentUser() user?: AuthUser) {
    return this.catalog.product(slug, user?.id);
  }

  @Get('products/:slug/related')
  related(@Param('slug') slug: string) {
    return this.catalog.related(slug);
  }

  @Get('search/suggest')
  suggest(@Query('q') q = '') {
    return this.catalog.suggest(q.slice(0, 100));
  }

  @Get('flash-sale')
  flashSale() {
    return this.catalog.currentFlashSale();
  }

  @Get('locations')
  async locations() {
    const s = await this.settings.get();
    return {
      divisions: DIVISIONS.map((d) => ({
        name: d.name,
        nameBn: d.nameBn,
        districts: d.districts.map((name) => ({ name, zone: zoneForDistrict(name) })),
      })),
      dhakaAreas: DHAKA_AREAS,
      zones: (Object.keys(s.delivery.zones) as DeliveryZone[]).map((zone) => ({
        zone,
        label: ZONE_LABELS[zone],
        ...s.delivery.zones[zone],
      })),
      freeShippingThreshold: s.delivery.freeShippingThreshold,
    };
  }

  @Get('store')
  async store() {
    const s = await this.settings.get();
    return {
      store: s.store,
      freeShippingThreshold: s.delivery.freeShippingThreshold,
      returnWindowDays: s.returns.windowDays,
      returnReasons: s.returns.reasons,
      coins: s.coins,
    };
  }
}
