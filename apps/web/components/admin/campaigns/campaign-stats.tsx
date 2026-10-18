/** Campaign counts for the edit page. Server-safe (no hooks). Counts only, no money. */
import { Panel, PanelTitle } from '@/components/admin/catalog/utils';
import { REWARD_KIND_LABEL, type CampaignStats } from './types';

const dayFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function Tile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-[6px] border border-line px-3 py-2.5">
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-ink">{value}</p>
      {hint && <p className="text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

export function CampaignStatsPanel({ stats, hasVoucher }: { stats: CampaignStats | null; hasVoucher: boolean }) {
  if (!stats) {
    return (
      <Panel className="mt-5">
        <PanelTitle title="Results" />
        <p className="px-4 py-6 text-sm text-ink-soft">Results could not be loaded. Refresh the page to try again.</p>
      </Panel>
    );
  }
  const days = stats.playsPerDay.slice(-14);
  const maxDay = Math.max(1, ...days.map((d) => d.plays));
  return (
    <Panel className="mt-5">
      <PanelTitle title="Results" description="Counts since the campaign was created. Plays are one per shopper per day (Dhaka time)." />
      <div className="grid grid-cols-2 gap-3 p-4 lg:grid-cols-4">
        <Tile label="Game plays" value={stats.plays} />
        <Tile label="Players" value={stats.players} hint="Different shoppers" />
        <Tile label="Voucher collects" value={hasVoucher ? stats.voucherCollects : '–'} hint={hasVoucher ? 'From the teaser start' : 'No voucher to collect'} />
        <Tile label="Orders with the voucher" value={hasVoucher ? stats.voucherOrders : '–'} hint={hasVoucher ? 'While the campaign ran' : undefined} />
      </div>
      <div className="grid gap-5 border-t border-line p-4 lg:grid-cols-2">
        <section aria-labelledby="plays-day">
          <h3 id="plays-day" className="mb-2 text-sm font-semibold text-ink">
            Plays per day{stats.playsPerDay.length > days.length ? ' (last 14 days)' : ''}
          </h3>
          {days.length === 0 ? (
            <p className="text-sm text-ink-soft">No plays yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {days.map((d) => (
                <li key={d.day} className="grid grid-cols-[6.5rem_minmax(0,1fr)_3rem] items-center gap-2 text-sm">
                  <span className="text-ink-soft">{dayFmt.format(new Date(`${String(d.day).slice(0, 10)}T00:00:00Z`))}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-paper" aria-hidden>
                    <span className="block h-full rounded-full bg-padma" style={{ width: `${(d.plays / maxDay) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-ink">{d.plays}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="rewards-won">
          <h3 id="rewards-won" className="mb-2 text-sm font-semibold text-ink">
            Rewards won
          </h3>
          {stats.rewards.length === 0 ? (
            <p className="text-sm text-ink-soft">This campaign has no rewards.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {stats.rewards.map((r) => {
                const pct = r.stock ? Math.min(100, (r.givenCount / r.stock) * 100) : 0;
                return (
                  <li key={r.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate">
                        <span lang="bn" className="font-medium text-ink">
                          {r.label}
                        </span>
                        <span className="ml-2 text-xs text-ink-faint">{REWARD_KIND_LABEL[r.kind]}</span>
                      </span>
                      <span className="shrink-0 tabular-nums text-ink">
                        {r.givenCount} <span className="text-ink-faint">/ {r.stock ?? 'unlimited'}</span>
                      </span>
                    </div>
                    {r.stock != null && (
                      <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-paper" aria-hidden>
                        <span className="block h-full rounded-full bg-marigold" style={{ width: `${pct}%` }} />
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </Panel>
  );
}
