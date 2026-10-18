'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { CampaignDeal } from '@/lib/campaign';
import { bn, tkBn } from '@/lib/format';
import { useReducedMotion } from './use-campaign';

/**
 * "আজকের সেরা ডিল": as each card scrolls into view, the old price is struck through, the new price
 * stamps in and the stock bar fills. Sideways scroll on phones, a grid of six on desktop.
 */
export function DealCards({ deals, preview }: { deals: CampaignDeal[]; preview: boolean }) {
  const list = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const root = list.current;
    const cards = root?.querySelectorAll<HTMLElement>('[data-deal]');
    // With reduced motion, cards simply show their final state.
    if (!root || !cards?.length || reduced) return;
    root.dataset.armed = '1';
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.in = '1';
          io.unobserve(e.target);
        }
      },
      { threshold: 0.4 },
    );
    cards.forEach((c) => io.observe(c));
    return () => {
      io.disconnect();
      delete root.dataset.armed;
    };
  }, [deals, reduced]);

  return (
    <section aria-labelledby="cmp-deals" className="min-w-0 rounded-[var(--radius-card)] border border-line bg-white p-3 sm:p-4">
      <h3 id="cmp-deals" className="mb-3 text-lg font-bold text-ink sm:text-xl">
        আজকের সেরা ডিল
      </h3>
      <div
        ref={list}
        className="no-scrollbar -mx-3 flex snap-x snap-mandatory gap-2 overflow-x-auto px-3 sm:mx-0 sm:grid sm:grid-cols-4 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-6"
      >
        {deals.map((d) => (
          <Link
            key={d.productSlug}
            href={`/product/${d.productSlug}`}
            data-deal
            tabIndex={preview ? -1 : undefined}
            className="cmp-deal group relative flex w-[40%] shrink-0 snap-start flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-white transition-colors hover:border-sindoor/40 sm:w-auto"
          >
            <div className="relative aspect-square bg-paper">
              {d.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={d.image} alt={d.title} width={300} height={300} loading="lazy" className="size-full object-cover" />
              )}
              {d.discountPct > 0 && (
                <span className="absolute left-1.5 top-1.5 rounded bg-sindoor px-1.5 py-0.5 text-[12px] font-bold text-white">
                  -{bn(d.discountPct)}%
                </span>
              )}
              {d.almostGone && !d.soldOut && (
                <span className="cmp-pulse absolute right-1.5 top-1.5 rounded bg-marigold px-1.5 py-0.5 text-[12px] font-bold text-ink">
                  প্রায় শেষ!
                </span>
              )}
              {d.soldOut && (
                <span className="absolute inset-x-0 bottom-0 bg-ink/75 py-1 text-center text-[13px] font-semibold text-white">স্টক শেষ</span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1 p-2">
              <p className="line-clamp-2 min-h-[2.6em] text-[13px] leading-[1.3] text-ink">{d.title}</p>
              <div className="mt-auto flex flex-wrap items-baseline gap-x-1.5">
                <span className="cmp-stamp inline-block text-[17px] font-bold leading-tight text-sindoor">{tkBn(d.price)}</span>
                {d.regularPrice > d.price && (
                  <span className="relative text-[12px] text-ink-faint">
                    {tkBn(d.regularPrice)}
                    <span className="cmp-strike absolute inset-x-[-2px] top-1/2 h-[2px] -translate-y-1/2 bg-sindoor" aria-hidden />
                    <span className="sr-only"> (আগের দাম)</span>
                  </span>
                )}
              </div>
              {d.soldPercent !== null && (
                <div className="mt-0.5">
                  <div className="h-1.5 overflow-hidden rounded-full bg-sindoor-tint">
                    <div className="cmp-fill h-full rounded-full bg-sindoor" style={{ ['--p' as string]: d.soldPercent / 100 }} />
                  </div>
                  <p className="mt-0.5 text-[11px] text-ink-soft">{bn(d.soldPercent)}% বিক্রি হয়ে গেছে</p>
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
