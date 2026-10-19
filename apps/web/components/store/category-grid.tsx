'use client';

import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';

export interface CategoryTile {
  id: string;
  slug: string;
  name: string;
  nameBn: string | null;
  imageUrl: string | null;
}

/** Rows shown before "Show all" on tablets and computers (6 per row from sm, 9 from lg). */
const ROWS = 3;
const SM_LIMIT = ROWS * 6;
const LG_LIMIT = ROWS * 9;

/**
 * Home page "Shop by category". Phones get one sideways-scrolling row, as before. Wider screens show
 * three rows and a button for the rest. Hiding is done in CSS per breakpoint, so the server-rendered
 * page already has the right number of tiles and nothing jumps when it loads.
 */
export function CategoryGrid({ categories }: { categories: CategoryTile[] }) {
  const [expanded, setExpanded] = useState(false);
  const sectionTop = useRef<HTMLDivElement>(null);
  const count = categories.length;
  const toggleable = count > SM_LIMIT;

  return (
    <div ref={sectionTop}>
      <div
        id="home-categories"
        className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 sm:mx-0 sm:grid sm:grid-cols-6 sm:gap-3 sm:overflow-visible sm:px-0 lg:grid-cols-9"
      >
        {categories.map((c, i) => (
          <Link
            key={c.id}
            href={`/category/${c.slug}`}
            className={clsx(
              'flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-[var(--radius-card)] border border-line bg-white p-2 text-center hover:border-padma/40 sm:w-auto',
              !expanded && i >= LG_LIMIT && 'sm:hidden',
              !expanded && i >= SM_LIMIT && i < LG_LIMIT && 'sm:max-lg:hidden',
            )}
          >
            {c.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.imageUrl} alt="" loading="lazy" className="aspect-square w-full rounded object-cover" />
            )}
            <span className="text-[13px] font-medium leading-tight text-ink">{c.name}</span>
            {c.nameBn && <span className="-mt-1 text-xs text-ink-faint">{c.nameBn}</span>}
          </Link>
        ))}
      </div>

      {toggleable && (
        <div className={clsx('mt-3 justify-center', count > LG_LIMIT ? 'hidden sm:flex' : 'hidden sm:max-lg:flex')}>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="home-categories"
            onClick={() => {
              setExpanded((e) => !e);
              // Collapsing removes the rows the visitor scrolled past; bring the heading back into view,
              // just below the sticky header.
              const grid = sectionTop.current;
              const headerHeight = document.querySelector('header')?.getBoundingClientRect().height ?? 0;
              if (expanded && grid && grid.getBoundingClientRect().top < headerHeight) {
                window.scrollTo({ top: window.scrollY + grid.getBoundingClientRect().top - headerHeight - 48, behavior: 'smooth' });
              }
            }}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line bg-white px-4 text-[15px] font-semibold text-ink hover:border-ink-faint"
          >
            {expanded ? 'Show fewer categories' : `Show all ${count} categories`}
            <ChevronDown className={clsx('size-4 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>
      )}
    </div>
  );
}
