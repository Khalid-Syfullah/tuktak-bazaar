import type { Metadata } from 'next';
import { CampaignEditor } from '@/components/admin/campaigns/campaign-editor';
import { CampaignStatsPanel } from '@/components/admin/campaigns/campaign-stats';
import type { CampaignDetail, CampaignStats, FlashSaleOption, VoucherOption } from '@/components/admin/campaigns/types';
import { mustGet, serverApi } from '@/lib/server';

export const metadata: Metadata = { title: 'Edit campaign' };

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [campaign, vouchers, flashSales, stats] = await Promise.all([
    mustGet<CampaignDetail>(`/admin/campaigns/${encodeURIComponent(id)}`),
    serverApi<VoucherOption[]>('/admin/vouchers'),
    serverApi<FlashSaleOption[]>('/admin/flash-sales'),
    serverApi<CampaignStats>(`/admin/campaigns/${encodeURIComponent(id)}/stats`).catch(() => null),
  ]);
  return (
    <CampaignEditor
      key={campaign.id}
      campaign={campaign}
      vouchers={vouchers ?? []}
      flashSales={flashSales ?? []}
      plays={stats?.plays}
      stats={<CampaignStatsPanel stats={stats} hasVoucher={Boolean(campaign.voucherId)} />}
    />
  );
}
