'use client';

import { Copy, Pencil, Power } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ConfirmDialog, DeleteButton } from '@/components/admin/catalog/common';
import { errorMessage } from '@/components/admin/catalog/utils';
import { useToast } from '@/components/providers';
import { Button } from '@/components/ui';
import { api, del, patch, post } from '@/lib/api';
import { type CampaignDetail, type CampaignListRow, detailToBody } from './types';

/** Edit, duplicate, switch off and delete for one row of the campaign list. */
export function CampaignRowActions({ row }: { row: Pick<CampaignListRow, 'id' | 'title' | 'status' | 'isActive' | 'plays'> }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<'copy' | 'off' | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);
  const showing = row.status === 'LIVE' || row.status === 'TEASER';

  async function duplicate() {
    setBusy('copy');
    try {
      const copy = await post<{ id: string }>(`/admin/campaigns/${row.id}/duplicate`);
      toast('Copy created. It is switched off until you turn it on.');
      router.push(`/admin/campaigns/${copy.id}`);
    } catch (e) {
      toast(errorMessage(e), 'error');
      setBusy(null);
    }
  }

  async function turnOff() {
    setBusy('off');
    try {
      // PATCH replaces the whole campaign, so start from what is saved.
      const full = await api<CampaignDetail>(`/admin/campaigns/${row.id}`);
      await patch(`/admin/campaigns/${row.id}`, { ...detailToBody(full), isActive: false });
      toast('Campaign switched off');
      router.refresh();
    } catch (e) {
      toast(errorMessage(e), 'error');
    } finally {
      setBusy(null);
      setConfirmOff(false);
    }
  }

  return (
    <span className="inline-flex items-center justify-end gap-0.5">
      <Link href={`/admin/campaigns/${row.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-semibold text-ink-soft hover:bg-black/5 hover:text-ink">
        <Pencil className="size-4" aria-hidden />
        Edit
      </Link>
      <Button type="button" variant="ghost" size="sm" className="px-2" loading={busy === 'copy'} onClick={duplicate} aria-label={`Duplicate ${row.title}`} title="Duplicate">
        {busy !== 'copy' && <Copy className="size-4" aria-hidden />}
      </Button>
      {row.isActive && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="px-2"
          loading={busy === 'off'}
          onClick={() => (showing ? setConfirmOff(true) : turnOff())}
          aria-label={`Turn off ${row.title}`}
          title="Turn off"
        >
          {busy !== 'off' && <Power className="size-4" aria-hidden />}
        </Button>
      )}
      {!row.isActive && <span className="inline-block w-8" aria-hidden />}
      <DeleteButton
        iconOnly
        label={`Delete ${row.title}`}
        title="Delete campaign"
        body={
          row.plays > 0 ? (
            <>
              <span lang="bn" className="font-semibold text-ink">
                {row.title}
              </span>{' '}
              has {row.plays} game play{row.plays === 1 ? '' : 's'}, so it will be switched off instead of deleted. Its results stay available.
            </>
          ) : (
            <>
              Delete{' '}
              <span lang="bn" className="font-semibold text-ink">
                {row.title}
              </span>
              ? This cannot be undone.
            </>
          )
        }
        confirmLabel={row.plays > 0 ? 'Switch off campaign' : 'Delete campaign'}
        onConfirm={async () => {
          try {
            const res = await del<{ ok: boolean; deactivated?: boolean }>(`/admin/campaigns/${row.id}`);
            toast(res?.deactivated ? 'Shoppers already played this campaign, so it was switched off instead of deleted' : 'Campaign deleted');
            router.refresh();
          } catch (e) {
            toast(errorMessage(e), 'error');
          }
        }}
      />
      <ConfirmDialog
        open={confirmOff}
        title="Turn off campaign"
        body={
          <>
            <span lang="bn" className="font-semibold text-ink">
              {row.title}
            </span>{' '}
            is showing in the store now. Turning it off removes the banner, offer strip and game straight away.
          </>
        }
        confirmLabel="Turn off"
        onClose={() => setConfirmOff(false)}
        onConfirm={turnOff}
      />
    </span>
  );
}
