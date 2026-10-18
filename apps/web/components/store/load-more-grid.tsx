'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import type { ListResponse, ProductCardData } from '@/lib/types';
import { Button } from '../ui';
import { ProductGrid } from './product-card';

/** "Just for you": first page rendered on the server, more pages on request. */
export function LoadMoreGrid({ initial, pages, query = 'sort=for_you' }: { initial: ProductCardData[]; pages: number; query?: string }) {
  const [items, setItems] = useState(initial);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  async function more() {
    setLoading(true);
    try {
      const next = await api<ListResponse>(`/products?${query}&limit=24&page=${page + 1}`);
      setItems((cur) => [...cur, ...next.items.filter((n) => !cur.some((c) => c.id === n.id))]);
      setPage(page + 1);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ProductGrid items={items} />
      {page < pages && (
        <div className="mt-6 flex justify-center">
          <Button variant="outline" size="lg" onClick={more} loading={loading} className="min-w-60 border-padma text-padma">
            Load more products
          </Button>
        </div>
      )}
    </>
  );
}
