import Link from 'next/link';
import { CampaignBlock } from '@/components/store/campaign/campaign-block';
import { CategoryGrid } from '@/components/store/category-grid';
import { FlashStrip } from '@/components/store/flash-strip';
import { HeroCarousel } from '@/components/store/hero-carousel';
import { HomeSide } from '@/components/store/home-side';
import { LoadMoreGrid } from '@/components/store/load-more-grid';
import { ProductCard } from '@/components/store/product-card';
import { serverApi } from '@/lib/server';
import type { CurrentCampaign } from '@/lib/campaign';
import type { Banner, CategoryNode, FlashSaleData, ProductCardData } from '@/lib/types';

interface HomeData {
  heroBanners: Banner[];
  stripBanners: Banner[];
  flashSale: FlashSaleData | null;
  categories: CategoryNode[];
  featured: ProductCardData[];
  justForYou: { items: ProductCardData[]; pages: number; seed?: string };
}

export default async function HomePage() {
  const [data, promo] = await Promise.all([serverApi<HomeData>('/home'), serverApi<CurrentCampaign>('/campaigns/current', { revalidate: 30 })]);
  if (!data) return null;
  const subcategories = data.categories.flatMap((c) => c.children);

  return (
    <div className="mx-auto max-w-[1240px] space-y-6 px-3 py-4 sm:px-4 sm:py-5">
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <HeroCarousel banners={data.heroBanners} />
        <HomeSide />
      </div>

      {data.flashSale && data.flashSale.items.length > 0 && <FlashStrip sale={data.flashSale} />}

      {data.stripBanners.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {data.stripBanners.map((b) => (
            <Link key={b.id} href={b.link} className="block overflow-hidden rounded-[var(--radius-card)]" aria-label={b.title}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.imageUrl} alt="" loading="lazy" className="aspect-[800/260] w-full object-cover" />
            </Link>
          ))}
        </div>
      )}

      {/* Promo campaign: right before "Shop by category", whenever one is live or in its teaser. */}
      {promo && <CampaignBlock data={promo} />}

      <section aria-labelledby="cat-title">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="cat-title" className="text-xl font-bold">
            Shop by category
          </h2>
          <Link href="/categories" className="text-[15px] font-semibold text-padma hover:underline md:hidden">
            All categories
          </Link>
        </div>
        <CategoryGrid
          categories={subcategories.map((c) => ({ id: c.id, slug: c.slug, name: c.name, nameBn: c.nameBn, imageUrl: c.imageUrl }))}
        />
      </section>

      {data.featured.length > 0 && (
        <section aria-labelledby="pop-title">
          <h2 id="pop-title" className="mb-3 text-xl font-bold">
            Popular this week
          </h2>
          <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:px-0 lg:grid-cols-6">
            {data.featured.slice(0, 12).map((p) => (
              <ProductCard key={p.id} p={p} className="w-[44%] shrink-0 sm:w-auto" />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="jfy-title">
        <div className="mb-3 flex items-center gap-3">
          <h2 id="jfy-title" className="text-xl font-bold">
            Just for you
          </h2>
          <div className="stitch-line flex-1" />
        </div>
        <LoadMoreGrid
          initial={data.justForYou.items}
          pages={data.justForYou.pages}
          query={data.justForYou.seed ? `sort=for_you&seed=${data.justForYou.seed}` : undefined}
        />
      </section>
    </div>
  );
}
