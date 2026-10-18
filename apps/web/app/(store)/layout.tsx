import { BottomNav } from '@/components/store/bottom-nav';
import { StoreFooter } from '@/components/store/footer';
import { OfferStrip } from '@/components/store/campaign/offer-strip';
import { StoreHeader } from '@/components/store/header';
import type { CurrentCampaign } from '@/lib/campaign';
import { serverApi } from '@/lib/server';
import type { CategoryNode } from '@/lib/types';

interface StoreInfo {
  store: { name: string; tagline: string; supportPhone: string; supportEmail: string };
  freeShippingThreshold: number;
}

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const [categories, info, promo] = await Promise.all([
    serverApi<CategoryNode[]>('/categories'),
    serverApi<StoreInfo>('/store'),
    // Cached for 30 s; the strip corrects the time itself.
    serverApi<CurrentCampaign>('/campaigns/current', { revalidate: 30 }),
  ]);
  const store = info?.store ?? { name: 'Tuktak Bazaar', tagline: '', supportPhone: '', supportEmail: '' };
  return (
    <>
      <StoreHeader categories={categories ?? []} supportPhone={store.supportPhone} freeShippingThreshold={info?.freeShippingThreshold ?? 2000} />
      {promo && <OfferStrip key={promo.campaign?.id ?? 'none'} data={promo} />}
      <main className="min-h-[60vh]">{children}</main>
      <StoreFooter categories={categories ?? []} store={store} />
      <BottomNav />
    </>
  );
}
