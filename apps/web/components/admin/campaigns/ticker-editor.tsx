'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button, clsx, Input } from '@/components/ui';
import { type TickerRow, uid } from './form';
import { DragHandle, MoveButtons, move, useDragSort } from './reorder';
import { MAX_TICKER } from './types';

const PLACEHOLDERS = ['৳২০০০+ অর্ডারে ঢাকায় ফ্রি ডেলিভারি', 'bKash-এ পেমেন্টে বিশেষ ছাড়', 'প্রতিদিন খেলুন — জিতুন ভাউচার ও কয়েন'];

/** The scrolling offer strip under the store header: short Bangla lines, each with an optional link. */
export function TickerEditor({ value, onChange, errors }: { value: TickerRow[]; onChange: (rows: TickerRow[]) => void; errors: Record<string, string> }) {
  const drag = useDragSort((from, to) => onChange(move(value, from, to)));
  const set = (key: string, patch: Partial<TickerRow>) => onChange(value.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const rowErrors = value.map((t) => errors[`ticker:${t.key}`]).filter(Boolean);

  return (
    <div>
      {value.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-soft">No offer strip. Add a line or two, such as free delivery or a payment offer.</p>
      ) : (
        <ol className="divide-y divide-line" aria-label="Offer strip items, in order">
          {value.map((t, i) => {
            const bad = Boolean(errors[`ticker:${t.key}`]);
            const { className: dragClass, ...rowProps } = drag.row(i);
            return (
              <li key={t.key} {...rowProps} className={clsx('flex items-start gap-2 px-4 py-3', bad && 'bg-sindoor-tint/40', dragClass)}>
                <span className="flex h-10 shrink-0 items-center gap-1">
                  <DragHandle {...drag.handle(i)} />
                  <span className="w-5 text-right text-xs tabular-nums text-ink-faint">{i + 1}</span>
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="block min-w-0 sm:flex-[3]">
                    <span className="sr-only">Text for item {i + 1}</span>
                    <Input
                      lang="bn"
                      value={t.text}
                      maxLength={120}
                      placeholder={PLACEHOLDERS[i % PLACEHOLDERS.length]}
                      aria-invalid={bad || undefined}
                      onChange={(e) => set(t.key, { text: e.target.value })}
                    />
                  </label>
                  <div className="flex min-w-0 items-center gap-1 sm:flex-[2]">
                    <label className="block min-w-0 flex-1">
                      <span className="sr-only">Link for item {i + 1} (optional)</span>
                      <Input value={t.href} maxLength={300} placeholder="Link (optional), e.g. /flash-sale" onChange={(e) => set(t.key, { href: e.target.value })} />
                    </label>
                    <MoveButtons index={i} count={value.length} label={`item ${i + 1}`} onMove={(to) => onChange(move(value, i, to))} />
                    <Button type="button" variant="ghost" size="sm" className="px-2 text-sindoor hover:text-sindoor" aria-label={`Remove item ${i + 1}`} onClick={() => onChange(value.filter((x) => x.key !== t.key))}>
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {(rowErrors.length > 0 || errors.ticker) && (
        <ul className="flex flex-col gap-0.5 border-t border-line px-4 py-2 text-sm text-sindoor">
          {errors.ticker && <li>{errors.ticker}</li>}
          {rowErrors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
        <Button type="button" variant="outline" size="sm" disabled={value.length >= MAX_TICKER} onClick={() => onChange([...value, { key: uid('t'), text: '', href: '' }])}>
          <Plus className="size-4" aria-hidden />
          Add item
        </Button>
        <span className="text-xs text-ink-soft">
          {value.length} of {MAX_TICKER}. Shows only while the campaign is live.
        </span>
      </div>
    </div>
  );
}
