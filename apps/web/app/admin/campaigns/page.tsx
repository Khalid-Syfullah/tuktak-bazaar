import { Megaphone, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AdminHeader } from '@/components/admin/shell';
import { CampaignStatusBadge } from '@/components/admin/campaigns/bits';
import { CampaignRowActions } from '@/components/admin/campaigns/row-actions';
import { type CampaignListRow, GAME_LABEL } from '@/components/admin/campaigns/types';
import { Panel, td, tdNum, th, thNum } from '@/components/admin/catalog/utils';
import { EmptyState } from '@/components/ui';
import { THEME_LABEL } from '@/lib/campaign';
import { dateTime } from '@/lib/format';
import { serverApi } from '@/lib/server';

export const metadata: Metadata = { title: 'Campaigns' };

const RANK = { LIVE: 0, TEASER: 1, SCHEDULED: 2, ENDED: 3, OFF: 4 } as const;

const newButton = (
  <Link
    href="/admin/campaigns/new"
    className="inline-flex h-10 items-center gap-2 rounded-md bg-padma px-4 text-[15px] font-semibold text-white hover:bg-padma-dark"
  >
    <Plus className="size-4" aria-hidden />
    New campaign
  </Link>
);

export default async function CampaignsPage() {
  const campaigns = (await serverApi<CampaignListRow[]>('/admin/campaigns')) ?? [];
  const time = (s: string) => new Date(s).getTime();
  const rows = [...campaigns].sort((a, b) => {
    const r = RANK[a.status] - RANK[b.status];
    if (r) return r;
    // Upcoming and running: soonest first. Finished and switched off: most recent first.
    return RANK[a.status] <= RANK.SCHEDULED ? time(a.startsAt) - time(b.startsAt) : time(b.startsAt) - time(a.startsAt);
  });
  // The store shows one campaign at a time: the highest priority, then the earliest start.
  const showing = rows
    .filter((c) => c.status === 'LIVE' || c.status === 'TEASER')
    .sort((a, b) => b.priority - a.priority || time(a.startsAt) - time(b.startsAt))[0];

  return (
    <>
      <AdminHeader
        title="Campaigns"
        description="Home page takeovers with a themed banner, countdown, deals, offer strip and a daily game. Times are Bangladesh time."
        actions={newButton}
      />
      <Panel>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="size-8" />}
            title="No campaigns yet"
            body="A campaign takes over the top of the home page for a few days: a themed banner that counts down to the start, picked deals, an offer strip under the header, a voucher to collect and an optional daily game."
            action={newButton}
          />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr>
                  <th className={th}>Campaign</th>
                  <th className={th}>Theme</th>
                  <th className={th}>Runs</th>
                  <th className={th}>Status</th>
                  <th className={thNum}>Priority</th>
                  <th className={th}>Game</th>
                  <th className={thNum}>Plays</th>
                  <th className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const live = c.status === 'LIVE' || c.status === 'TEASER';
                  return (
                    <tr key={c.id} className="hover:bg-paper/50">
                      <td className={td}>
                        <Link href={`/admin/campaigns/${c.id}`} lang="bn" className="font-medium text-ink hover:text-padma hover:underline">
                          {c.title}
                        </Link>
                        <span className="block font-mono text-xs text-ink-faint">{c.slug}</span>
                      </td>
                      <td className={`${td} whitespace-nowrap text-ink-soft`}>{THEME_LABEL[c.theme] ?? c.theme}</td>
                      <td className={`${td} whitespace-nowrap text-ink-soft`}>
                        {dateTime(c.startsAt)}
                        <span className="block">to {dateTime(c.endsAt)}</span>
                        {c.teaserHours > 0 && <span className="block text-xs text-ink-faint">Teaser {c.teaserHours} h before</span>}
                      </td>
                      <td className={td}>
                        <CampaignStatusBadge status={c.status} />
                        {live && (
                          <span className="mt-0.5 block whitespace-nowrap text-xs text-ink-faint">{showing?.id === c.id ? 'Showing in the store' : 'Hidden by a higher priority'}</span>
                        )}
                      </td>
                      <td className={tdNum}>{c.priority}</td>
                      <td className={`${td} whitespace-nowrap ${c.gameEnabled ? 'text-ink' : 'text-ink-faint'}`}>{c.gameEnabled ? GAME_LABEL[c.gameStyle] : 'Off'}</td>
                      <td className={tdNum}>{c.plays}</td>
                      <td className={`${td} whitespace-nowrap text-right`}>
                        <CampaignRowActions row={c} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
