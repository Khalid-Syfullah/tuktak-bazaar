'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { RewardKind } from '@/lib/campaign';
import { td, th, thNum } from '@/components/admin/catalog/utils';
import { Badge, Button, clsx, Input, Select } from '@/components/ui';
import { date } from '@/lib/format';
import { newReward, oddsFor, type RewardRow, rewardAutoLabel, soldOut } from './form';
import { DragHandle, MoveButtons, move, useDragSort } from './reorder';
import { MAX_REWARDS, REWARD_KIND_LABEL, type VoucherOption } from './types';

const LABEL_PLACEHOLDER: Record<RewardKind, string> = { VOUCHER: '৳৫০ ছাড়', COINS: '২০ কয়েন', NONE: 'আবার চেষ্টা করুন' };
const cell = 'border-b border-line px-2 py-2 align-top';

function validDuring(v: VoucherOption, span: { start: string | null; end: string | null }) {
  if (!span.start || !span.end) return true;
  return Date.parse(v.startsAt) < Date.parse(span.end) && Date.parse(v.endsAt) > Date.parse(span.start);
}

/** Rewards in wheel order, with live odds (weight ÷ total weight of rewards that still have stock). */
export function RewardEditor({
  value,
  onChange,
  vouchers,
  errors,
  window: span,
}: {
  value: RewardRow[];
  onChange: (rows: RewardRow[]) => void;
  vouchers: VoucherOption[];
  errors: Record<string, string>;
  /** The campaign's start and end (ISO), to flag vouchers that aren't valid during it. */
  window: { start: string | null; end: string | null };
}) {
  const drag = useDragSort((from, to) => onChange(move(value, from, to)));
  const odds = oddsFor(value);
  const totalOdds = [...odds.values()].reduce<number>((s, o) => s + (o ?? 0), 0);
  const rowErrors = value.map((r) => errors[`reward:${r.key}`]).filter(Boolean);

  const set = (key: string, patch: Partial<RewardRow>) =>
    onChange(
      value.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        if ('label' in patch) next.autoLabel = false;
        else if (next.autoLabel || !next.label.trim()) {
          next.label = rewardAutoLabel(next, vouchers);
          next.autoLabel = true;
        }
        return next;
      }),
    );

  const voucherChoices = (current: string) => vouchers.filter((v) => v.isActive || v.id === current);

  return (
    <div>
      {value.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-ink-soft">No rewards yet. Add the prizes shoppers can win, including a &ldquo;try again&rdquo; slot.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead>
              <tr>
                <th className={th}>Order</th>
                <th className={th}>Label (Bangla)</th>
                <th className={th}>Kind</th>
                <th className={th}>Prize</th>
                <th className={thNum}>Weight</th>
                <th className={thNum}>Odds</th>
                <th className={thNum}>Stock</th>
                <th className={thNum}>Won so far</th>
                <th className={th}>
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {value.map((r, i) => {
                const bad = Boolean(errors[`reward:${r.key}`]);
                const o = odds.get(r.key);
                const out = soldOut(r);
                const { className: dragClass, ...rowProps } = drag.row(i);
                const name = r.label.trim() || `reward ${i + 1}`;
                // Shoppers have won this exact prize, so it stays fixed (the API refuses a change too).
                const won = r.givenCount > 0;
                const lockedTitle = `Won ${r.givenCount} times, so the prize can't change. Add a new reward for a new prize, and set this one's stock to ${r.givenCount} to stop it.`;
                return (
                  <tr key={r.key} {...rowProps} className={clsx(bad && 'bg-sindoor-tint/40', dragClass)}>
                    <td className={cell}>
                      <span className="flex h-9 items-center gap-1">
                        <DragHandle {...drag.handle(i)} />
                        <span className="w-5 text-right text-xs tabular-nums text-ink-faint">{i + 1}</span>
                        <MoveButtons index={i} count={value.length} label={name} onMove={(to) => onChange(move(value, i, to))} />
                      </span>
                    </td>
                    <td className={cell}>
                      <Input
                        lang="bn"
                        className="h-9 min-w-44"
                        value={r.label}
                        maxLength={40}
                        placeholder={LABEL_PLACEHOLDER[r.kind]}
                        aria-label={`Label for reward ${i + 1}`}
                        aria-invalid={bad || undefined}
                        onChange={(e) => set(r.key, { label: e.target.value })}
                      />
                    </td>
                    <td className={cell}>
                      <Select
                        className="h-9 min-w-32 max-w-32"
                        value={r.kind}
                        aria-label={`Kind of reward ${i + 1}`}
                        disabled={won}
                        title={won ? lockedTitle : undefined}
                        onChange={(e) => {
                          const kind = e.target.value as RewardKind;
                          set(r.key, { kind, voucherId: kind === 'VOUCHER' ? r.voucherId : '', coins: kind === 'COINS' ? r.coins || '20' : '' });
                        }}
                      >
                        {(Object.keys(REWARD_KIND_LABEL) as RewardKind[]).map((k) => (
                          <option key={k} value={k}>
                            {REWARD_KIND_LABEL[k]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className={cell}>
                      {r.kind === 'VOUCHER' && (
                        <Select
                          className="h-9 min-w-60 max-w-72"
                          value={r.voucherId}
                          aria-label={`Voucher for reward ${i + 1}`}
                          disabled={won}
                          title={won ? lockedTitle : undefined}
                          onChange={(e) => set(r.key, { voucherId: e.target.value })}
                        >
                          <option value="">Pick a voucher…</option>
                          {voucherChoices(r.voucherId).map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.code}: {v.title} ({date(v.startsAt)} to {date(v.endsAt)})
                              {v.isActive ? (validDuring(v, span) ? '' : ' (not valid during this campaign)') : ' (switched off)'}
                            </option>
                          ))}
                        </Select>
                      )}
                      {r.kind === 'COINS' && (
                        <span className="flex items-center gap-2">
                          <Input
                            className="h-9 min-w-24 max-w-24 text-right tabular-nums"
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={10000}
                            value={r.coins}
                            aria-label={`Coins for reward ${i + 1}`}
                            disabled={won}
                            title={won ? lockedTitle : undefined}
                            onChange={(e) => set(r.key, { coins: e.target.value })}
                          />
                          <span className="text-ink-soft">coins</span>
                        </span>
                      )}
                      {r.kind === 'NONE' && <span className="flex h-9 items-center text-ink-soft">No prize</span>}
                    </td>
                    <td className={clsx(cell, 'text-right')}>
                      <Input
                        className="ml-auto h-9 min-w-20 max-w-20 text-right tabular-nums"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={10000}
                        value={r.weight}
                        aria-label={`Weight for reward ${i + 1}`}
                        onChange={(e) => set(r.key, { weight: e.target.value })}
                      />
                    </td>
                    <td className={clsx(cell, 'text-right tabular-nums')}>
                      <div className="ml-auto w-24 pt-1.5">
                        <span className={clsx('font-semibold', out ? 'text-ink-faint' : 'text-ink')}>{o == null ? '–' : `${o.toFixed(1)}%`}</span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-paper" aria-hidden>
                          <span className="block h-full rounded-full bg-padma" style={{ width: `${Math.min(100, o ?? 0)}%` }} />
                        </span>
                        {out && <span className="mt-0.5 block text-xs text-ink-faint">Out of stock</span>}
                      </div>
                    </td>
                    <td className={clsx(cell, 'text-right')}>
                      <Input
                        className="ml-auto h-9 min-w-28 max-w-28 text-right tabular-nums"
                        type="number"
                        inputMode="numeric"
                        min={Math.max(0, r.givenCount)}
                        value={r.stock}
                        placeholder="Unlimited"
                        aria-label={`Stock for reward ${i + 1} (blank for unlimited)`}
                        onChange={(e) => set(r.key, { stock: e.target.value })}
                      />
                    </td>
                    <td className={clsx(cell, 'text-right tabular-nums')}>
                      <span className="flex h-9 items-center justify-end">{r.id ? r.givenCount : <Badge tone="blue">New</Badge>}</span>
                    </td>
                    <td className={clsx(cell, 'text-right')}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 px-2 text-sindoor hover:text-sindoor"
                        disabled={r.givenCount > 0}
                        title={r.givenCount > 0 ? `Won ${r.givenCount} times, so it can't be removed. Set its weight to 1 or its stock to ${r.givenCount} instead.` : undefined}
                        aria-label={r.givenCount > 0 ? `${name} has been won and can't be removed` : `Remove ${name}`}
                        onClick={() => onChange(value.filter((x) => x.key !== r.key))}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className={clsx(td, 'border-b-0 text-xs text-ink-soft')}>
                  Odds are each weight divided by the total weight of rewards that still have stock. A reward that runs out drops to 0%.
                </td>
                <td className={clsx(td, 'border-b-0 text-right text-xs text-ink-soft')}>Total</td>
                <td className={clsx(td, 'border-b-0 text-right text-xs font-semibold tabular-nums text-ink')}>{value.length ? `${Math.round(totalOdds)}%` : ''}</td>
                <td colSpan={3} className={clsx(td, 'border-b-0')} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {(rowErrors.length > 0 || errors.rewards) && (
        <ul className="flex flex-col gap-0.5 border-t border-line px-4 py-2 text-sm text-sindoor">
          {errors.rewards && <li>{errors.rewards}</li>}
          {rowErrors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
        {(['VOUCHER', 'COINS', 'NONE'] as RewardKind[]).map((k) => (
          <Button
            key={k}
            type="button"
            variant="outline"
            size="sm"
            disabled={value.length >= MAX_REWARDS}
            onClick={() => onChange([...value, newReward(k, k === 'NONE' ? { weight: '40' } : {})])}
          >
            <Plus className="size-4" aria-hidden />
            {k === 'VOUCHER' ? 'Voucher reward' : k === 'COINS' ? 'Coins reward' : 'Try again slot'}
          </Button>
        ))}
        <span className="text-xs text-ink-soft">
          {value.length} of {MAX_REWARDS}
        </span>
      </div>
    </div>
  );
}
