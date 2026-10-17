'use client';

import { Megaphone } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CampaignView, CurrentCampaign } from '@/lib/campaign';
import { THEMES } from './themes';
import { phaseAt, useFreshCampaign, useReducedMotion, useServerNow } from './use-campaign';

const SPEED = 40; // px per second

/**
 * The offer strip under the header on every store page while a campaign is live. Scrolls right to left
 * in a seamless loop and pauses on hover or keyboard focus; with reduced motion it shows one item at a time.
 * Like the home page block, it stays mounted to pick up a campaign when one starts or the next one when this ends.
 */
export function OfferStrip({ data, preview = false }: { data: CurrentCampaign; preview?: boolean }) {
  const now = useServerNow(data.serverNow, preview);
  const { view: c } = useFreshCampaign(data, now, preview);
  const reduced = useReducedMotion();
  if (!c) return null;
  const phase = now === null ? c.status : phaseAt(now, c.startsAt, c.endsAt);
  const t = THEMES[c.theme];
  if (phase !== 'LIVE' || !c.ticker.length) return null;
  return (
    <div
      className="cmp-strip relative h-9 overflow-hidden text-[13.5px] font-semibold sm:text-sm"
      style={{ background: t.stripBg, color: t.stripInk }}
      role="region"
      aria-label="চলমান অফার"
    >
      {reduced ? <Rotating items={c.ticker} /> : <Marquee items={c.ticker} preview={preview} />}
    </div>
  );
}

function Items({ items, hidden, preview }: { items: CampaignView['ticker']; hidden?: boolean; preview?: boolean }) {
  return (
    <ul className="flex h-9 shrink-0 items-center gap-10 pr-10" aria-hidden={hidden || undefined}>
      {items.map((it, i) => (
        <li key={i} className="flex items-center gap-2 whitespace-nowrap">
          <Megaphone className="size-3.5 opacity-80" aria-hidden />
          {it.href ? (
            <Link href={it.href} className="underline-offset-2 hover:underline focus-visible:underline" tabIndex={hidden || preview ? -1 : undefined}>
              {it.text}
            </Link>
          ) : (
            <span>{it.text}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Marquee({ items, preview }: { items: CampaignView['ticker']; preview: boolean }) {
  const first = useRef<HTMLDivElement>(null);
  const [duration, setDuration] = useState(30);
  const [copies, setCopies] = useState(2);
  // Enough copies to cover wide screens, and a duration that keeps the speed at ~40 px/s.
  useLayoutEffect(() => {
    const el = first.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width || 1;
      setCopies(Math.max(2, Math.ceil((window.innerWidth * 2) / w)));
      setDuration(w / SPEED);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [items]);
  return (
    <div className="cmp-marquee flex w-max" style={{ ['--cmp-shift' as string]: `-${100 / copies}%`, animationDuration: `${duration}s` }}>
      {Array.from({ length: copies }, (_, i) => (
        <div key={i} ref={i === 0 ? first : undefined} className="flex">
          <Items items={items} hidden={i > 0} preview={preview} />
        </div>
      ))}
    </div>
  );
}

function Rotating({ items }: { items: CampaignView['ticker'] }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length < 2) return;
    const id = setInterval(() => setI((n) => (n + 1) % items.length), 5000);
    return () => clearInterval(id);
  }, [items.length]);
  const it = items[i];
  return (
    <div key={i} className="cmp-fade flex h-9 items-center justify-center gap-2 px-4 text-center">
      <Megaphone className="size-3.5 shrink-0 opacity-80" aria-hidden />
      {it.href ? (
        <Link href={it.href} className="truncate underline-offset-2 hover:underline">
          {it.text}
        </Link>
      ) : (
        <span className="truncate">{it.text}</span>
      )}
    </div>
  );
}
