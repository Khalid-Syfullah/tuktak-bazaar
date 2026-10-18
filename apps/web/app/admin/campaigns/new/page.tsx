import type { Metadata } from 'next';
import { CampaignEditor } from '@/components/admin/campaigns/campaign-editor';
import type { FlashSaleOption, VoucherOption } from '@/components/admin/campaigns/types';
import { serverApi } from '@/lib/server';

export const metadata: Metadata = { title: 'New campaign' };

export default async function NewCampaignPage() {
  const [vouchers, flashSales] = await Promise.all([serverApi<VoucherOption[]>('/admin/vouchers'), serverApi<FlashSaleOption[]>('/admin/flash-sales')]);
  return <CampaignEditor vouchers={vouchers ?? []} flashSales={flashSales ?? []} />;
}
