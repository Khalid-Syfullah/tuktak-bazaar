'use client';

import { Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Thumb } from '@/components/admin/catalog/utils';
import { Badge, Button, clsx, Input, Spinner } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { tk } from '@/lib/format';
import { DragHandle, MoveButtons, move, useDragSort } from './reorder';
import { type CampaignProductRow, MAX_PRODUCTS } from './types';

interface InventoryHit {
  id: string;
  sku: string;
  label: string | null;
  price: number;
  regularPrice: number;
  salePrice: number | null;
  isActive: boolean;
  product: { id: string; title: string; slug: string; image: string | null };
}

const SHOW_HITS = 8;

/** Search products by title or SKU, pick up to 24 variants, then order them as they show on the banner. */
export function ProductPicker({ value, onChange, error }: { value: CampaignProductRow[]; onChange: (rows: CampaignProductRow[]) => void; error?: string }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<InventoryHit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const added = new Set(value.map((p) => p.variantId));
  const full = value.length >= MAX_PRODUCTS;
  const drag = useDragSort((from, to) => onChange(move(value, from, to)));

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const term = q.trim();
    if (term.length < 2) {
      setHits(null);
      setSearchError(null);
      return;
    }
    let live = true;
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api<{ items: InventoryHit[]; total: number }>(`/admin/campaigns/products?q=${encodeURIComponent(term)}`);
        if (!live) return;
        setHits(res.items.slice(0, SHOW_HITS));
        setTotal(res.total);
        setSearchError(null);
      } catch (e) {
        if (!live) return;
        setHits(null);
        setSearchError(
          e instanceof ApiError && e.status === 403 ? 'Your account needs the Marketing permission to search products.' : e instanceof Error ? e.message : 'Search failed',
        );
      } finally {
        if (live) setSearching(false);
      }
    }, 300);
    return () => {
      live = false;
    };
  }, [q]);

  function add(h: InventoryHit) {
    if (added.has(h.id) || full) return;
    onChange([...value, { variantId: h.id, sku: h.sku, title: h.product.title, variantLabel: h.label, price: h.price, image: h.product.image, isActive: h.isActive }]);
  }

  return (
    <div>
      <div className="p-4 pb-3">
        <label className="block max-w-xl">
          <span className="mb-1 block text-sm font-medium text-ink">Add products</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
            <Input
              type="search"
              className="pl-9"
              value={q}
              placeholder="Title or SKU"
              disabled={full}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const first = hits?.find((h) => !added.has(h.id));
                  if (hits?.length === 1 && first) add(first);
                }
              }}
            />
            {searching && <Spinner className="absolute right-3 top-1/2 size-4 -translate-y-1/2" />}
          </span>
          <span className="mt-1 block text-xs text-ink-soft">
            {full ? `That's the limit of ${MAX_PRODUCTS} products. Remove one to add another.` : `${value.length} of ${MAX_PRODUCTS} picked. Shoppers see up to 12 deals, flash-sale items first.`}
          </span>
        </label>
        {searchError && <p className="mt-2 text-sm text-sindoor">{searchError}</p>}
        {hits && (
          <div className="mt-2 max-w-xl overflow-hidden rounded-[6px] border border-line">
            {hits.length === 0 ? (
              <p className="px-3 py-3 text-sm text-ink-soft">No products found for that search.</p>
            ) : (
              <ul className="divide-y divide-line">
                {hits.map((h) => {
                  const isAdded = added.has(h.id);
                  return (
                    <li key={h.id} className="flex items-center gap-3 px-3 py-2">
                      <Thumb src={h.product.image} size={36} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{h.product.title}</span>
                        <span className="block truncate text-xs text-ink-soft">
                          {h.label ? `${h.label}, ` : ''}
                          <span className="font-mono">{h.sku}</span>
                        </span>
                      </span>
                      <span className="text-right text-sm tabular-nums">
                        <span className="block font-medium text-ink">{tk(h.price)}</span>
                        {h.salePrice != null && h.regularPrice > h.price && <span className="block text-xs text-ink-faint line-through">{tk(h.regularPrice)}</span>}
                      </span>
                      <Button type="button" variant={isAdded ? 'ghost' : 'outline'} size="sm" disabled={isAdded || full} onClick={() => add(h)} aria-label={isAdded ? `${h.sku} added` : `Add ${h.product.title} ${h.sku}`}>
                        {isAdded ? (
                          'Added'
                        ) : (
                          <>
                            <Plus className="size-4" aria-hidden />
                            Add
                          </>
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            {total > hits.length && <p className="border-t border-line bg-paper/60 px-3 py-1.5 text-xs text-ink-soft">Showing {hits.length} of {total}. Type more of the title or SKU to narrow it down.</p>}
          </div>
        )}
      </div>

      {value.length === 0 ? (
        <p className="border-t border-line px-4 py-6 text-center text-sm text-ink-soft">No hand-picked products. Flash-sale items (if linked above) still show as deals.</p>
      ) : (
        <ol className="divide-y divide-line border-t border-line" aria-label="Picked products, in display order">
          {value.map((p, i) => {
            const deleted = !p.sku;
            const { className: dragClass, ...rowProps } = drag.row(i);
            return (
              <li key={p.variantId} {...rowProps} className={clsx('flex items-center gap-2 px-4 py-2 sm:gap-3', dragClass)}>
                <DragHandle {...drag.handle(i)} />
                <span className="w-5 shrink-0 text-right text-xs tabular-nums text-ink-faint">{i + 1}</span>
                <Thumb src={p.image} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{p.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-soft">
                    <span className="truncate">
                      {p.variantLabel ? `${p.variantLabel}, ` : ''}
                      <span className="font-mono">{p.sku || 'no SKU'}</span>
                    </span>
                    <span className="tabular-nums text-ink sm:hidden">{tk(p.price)}</span>
                    {deleted ? <Badge tone="red">Deleted</Badge> : !p.isActive && <Badge tone="amber">Hidden in store</Badge>}
                  </span>
                </span>
                <span className="hidden w-24 text-right text-sm tabular-nums text-ink sm:block">{tk(p.price)}</span>
                <MoveButtons index={i} count={value.length} label={p.title} onMove={(to) => onChange(move(value, i, to))} />
                <Button type="button" variant="ghost" size="sm" className="px-2 text-sindoor hover:text-sindoor" aria-label={`Remove ${p.title} ${p.sku}`} onClick={() => onChange(value.filter((x) => x.variantId !== p.variantId))}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            );
          })}
        </ol>
      )}
      {error && <p className="border-t border-line px-4 py-2 text-sm text-sindoor">{error}</p>}
    </div>
  );
}
