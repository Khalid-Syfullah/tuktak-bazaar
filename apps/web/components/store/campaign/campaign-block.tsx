'use client';

import clsx from 'clsx';
import type { CurrentCampaign } from '@/lib/campaign';
import { CampaignBanner } from './campaign-banner';
import { DailyGame } from './daily-game';
import { DealCards } from './deal-cards';
import { dhakaDay, phaseAt, useCampaignMe, useFreshCampaign, useServerNow } from './use-campaign';

/**
 * The campaign block on the home page (banner, deal cards, daily game), right before "Shop by category".
 * The server renders it with the page; the countdown, confetti, game and the shopper's own state take
 * over in the browser. The campaign is fetched again whenever its data changes (it goes live, a flash
 * sale behind its deals starts or ends, it ends and another takes over), without a reload. `preview` is
 * for Admin → Campaigns: no requests, the clock starts at `data.serverNow`, and confetti plays every time.
 */
export function CampaignBlock({ data, preview = false }: { data: CurrentCampaign; preview?: boolean }) {
  // On the store the block stays mounted even with no campaign, so one appears when its teaser starts.
  if (preview && !data.campaign) return null;
  return <Block key={`${data.campaign?.id ?? 'none'}-${preview ? data.serverNow : ''}`} data={data} preview={preview} />;
}

function Block({ data, preview }: { data: CurrentCampaign; preview: boolean }) {
  const now = useServerNow(data.serverNow, preview);
  const { view: c, due } = useFreshCampaign(data, now, preview);
  const me = useCampaignMe(c?.id ?? '', !preview && !!c, now === null ? null : dhakaDay(now));
  // The game keeps its own result on screen, so it starts over for each shopper and each Dhaka day.
  const gameKey = `${me.owner}:${dhakaDay(now ?? Date.parse(data.serverNow))}`;
  if (!c) return null;
  const phase = now === null ? c.status : phaseAt(now, c.startsAt, c.endsAt);
  if (phase === 'ENDED') return null;
  // While fresh data is due, deal prices may be out of date, so the cards wait for it.
  const showDeals = phase === 'LIVE' && !due && c.deals.length > 0;
  const showGame = phase === 'LIVE' && !!c.game && c.game.rewards.length > 0;
  return (
    <section key={c.id} id="campaign" aria-label={c.title} lang="bn" className="scroll-mt-28 space-y-3">
      <CampaignBanner c={c} phase={phase} now={now} preview={preview} me={me} />
      {(showDeals || showGame) && (
        <div className={clsx('grid gap-3', showDeals && showGame && 'lg:grid-cols-[minmax(0,1fr)_300px]')}>
          {showDeals && <DealCards deals={c.deals} preview={preview} />}
          {showGame && <DailyGame key={gameKey} c={c} preview={preview} me={me} />}
        </div>
      )}
    </section>
  );
}
