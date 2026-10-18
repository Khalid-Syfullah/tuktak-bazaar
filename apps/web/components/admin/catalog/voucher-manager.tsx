'use client';

import { BadgePercent, Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { useToast } from '@/components/providers';
import { Badge, Button, EmptyState, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { del, patch, post } from '@/lib/api';
import { date, tk, voucherValue } from '@/lib/format';
import { DeleteButton, Toggle } from './common';
import { errorMessage, fromDhakaInput, Panel, PanelTitle, phaseOf, PhaseBadge, td, tdNum, th, thNum, toDhakaInput } from './utils';

export interface VoucherRow {
  id: string;
  code: string;
  title: string;
  description: string | null;
  type: 'PERCENT' | 'FIXED' | 'FREE_SHIPPING';
  value: number;
  maxDiscount: number | null;
  minSpend: number;
  startsAt: string;
  endsAt: string;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  isActive: boolean;
  isCollectible: boolean;
  collectedCount: number;
}

export function VoucherManager({ vouchers }: { vouchers: VoucherRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<VoucherRow | 'new' | null>(null);
  const [now] = useState(() => Date.now());

  return (
    <Panel>
      <PanelTitle
        title={`${vouchers.length} voucher${vouchers.length === 1 ? '' : 's'}`}
        actions={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-4" aria-hidden />
            Add voucher
          </Button>
        }
      />
      {vouchers.length === 0 ? (
        <EmptyState icon={<BadgePercent className="size-8" />} title="No vouchers yet" body="Create a code to share on Facebook, or a collectible voucher shoppers can save." />
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead>
              <tr>
                <th className={th}>Code</th>
                <th className={th}>Title</th>
                <th className={th}>Value</th>
                <th className={thNum}>Min spend</th>
                <th className={thNum}>Used</th>
                <th className={thNum}>Collected</th>
                <th className={th}>Valid</th>
                <th className={th}>Status</th>
                <th className={th}>Collectible</th>
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((v) => (
                <tr key={v.id}>
                  <td className={`${td} font-mono font-semibold text-ink`}>{v.code}</td>
                  <td className={`${td} max-w-64 text-ink`}>{v.title}</td>
                  <td className={`${td} whitespace-nowrap`}>
                    <span className="font-medium text-sindoor">{voucherValue(v)}</span>
                    {v.type === 'PERCENT' && v.maxDiscount != null && <span className="block text-xs text-ink-soft">Up to {tk(v.maxDiscount)}</span>}
                  </td>
                  <td className={tdNum}>{v.minSpend ? tk(v.minSpend) : 'None'}</td>
                  <td className={tdNum}>
                    {v.usedCount}
                    <span className="text-ink-faint"> / {v.usageLimit ?? 'no limit'}</span>
                  </td>
                  <td className={tdNum}>{v.collectedCount}</td>
                  <td className={`${td} whitespace-nowrap text-ink-soft`}>
                    {date(v.startsAt)} to {date(v.endsAt)}
                  </td>
                  <td className={td}>
                    <PhaseBadge phase={phaseOf(v.startsAt, v.endsAt, v.isActive, now)} liveLabel="Active" />
                  </td>
                  <td className={td}>{v.isCollectible ? <Badge tone="blue">Collectible</Badge> : <Badge>Code only</Badge>}</td>
                  <td className={`${td} whitespace-nowrap text-right`}>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(v)}>
                      <Pencil className="size-4" aria-hidden />
                      Edit
                    </Button>
                    <DeleteButton
                      iconOnly
                      label={`Delete ${v.code}`}
                      title="Delete voucher"
                      body={
                        v.usedCount > 0 ? (
                          <>
                            <span className="font-mono font-semibold text-ink">{v.code}</span> has been used on orders, so it will be switched off instead of deleted.
                          </>
                        ) : (
                          <>
                            Delete <span className="font-mono font-semibold text-ink">{v.code}</span>? Shoppers who collected it will lose it.
                          </>
                        )
                      }
                      confirmLabel={v.usedCount > 0 ? 'Switch off voucher' : 'Delete voucher'}
                      onConfirm={async () => {
                        try {
                          const res = await del<{ deactivated?: boolean; reason?: 'used' | 'campaign' }>(`/admin/vouchers/${v.id}`);
                          toast(
                            !res?.deactivated
                              ? 'Voucher deleted'
                              : res.reason === 'campaign'
                                ? 'A campaign reward uses this voucher, so it was switched off'
                                : 'Voucher was used before, so it was switched off',
                          );
                          router.refresh();
                        } catch (e) {
                          toast(errorMessage(e), 'error');
                        }
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <VoucherForm
          key={editing === 'new' ? 'new' : editing.id}
          row={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </Panel>
  );
}

function defaults(row: VoucherRow | null) {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
  return {
    code: row?.code ?? '',
    title: row?.title ?? '',
    description: row?.description ?? '',
    type: row?.type ?? ('PERCENT' as VoucherRow['type']),
    value: row && row.type !== 'FREE_SHIPPING' ? String(row.value) : '',
    maxDiscount: row?.maxDiscount != null ? String(row.maxDiscount) : '',
    minSpend: String(row?.minSpend ?? 0),
    startsAt: toDhakaInput(row?.startsAt ?? start),
    endsAt: toDhakaInput(row?.endsAt ?? end),
    usageLimit: row?.usageLimit != null ? String(row.usageLimit) : '',
    perUserLimit: String(row?.perUserLimit ?? 1),
    isActive: row?.isActive ?? true,
    isCollectible: row?.isCollectible ?? false,
  };
}

const whole = (s: string, min: number) => s.trim() !== '' && Number.isInteger(Number(s)) && Number(s) >= min;

function VoucherForm({ row, onClose, onSaved }: { row: VoucherRow | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [f, setF] = useState(() => defaults(row));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setErrors((e) => {
      if (!(k in e)) return e;
      const { [k as string]: _gone, ...rest } = e;
      return rest;
    });
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const code = f.code.trim().toUpperCase().replace(/\s+/g, '');
    if (code.length < 3 || code.length > 30) errs.code = 'Use 3 to 30 letters or numbers';
    if (f.title.trim().length < 2) errs.title = 'Enter a short title shoppers will see';
    if (f.type === 'PERCENT' && (!whole(f.value, 1) || Number(f.value) > 90)) errs.value = 'Enter 1 to 90';
    if (f.type === 'FIXED' && !whole(f.value, 1)) errs.value = 'Enter the discount in whole taka';
    if (f.type === 'PERCENT' && f.maxDiscount.trim() && !whole(f.maxDiscount, 1)) errs.maxDiscount = 'Enter whole taka or leave blank';
    if (!whole(f.minSpend, 0)) errs.minSpend = 'Enter 0 or more';
    const startsAt = fromDhakaInput(f.startsAt);
    const endsAt = fromDhakaInput(f.endsAt);
    if (!startsAt) errs.startsAt = 'Pick a start date and time';
    if (!endsAt) errs.endsAt = 'Pick an end date and time';
    else if (startsAt && endsAt <= startsAt) errs.endsAt = 'End must be after the start';
    if (f.usageLimit.trim() && !whole(f.usageLimit, 1)) errs.usageLimit = 'Enter 1 or more, or leave blank';
    if (!whole(f.perUserLimit, 1) || Number(f.perUserLimit) > 100) errs.perUserLimit = 'Enter 1 to 100';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    const body = {
      code,
      title: f.title.trim(),
      description: f.description.trim() || null,
      type: f.type,
      value: f.type === 'FREE_SHIPPING' ? 0 : Number(f.value),
      maxDiscount: f.type === 'PERCENT' && f.maxDiscount.trim() ? Number(f.maxDiscount) : null,
      minSpend: Number(f.minSpend),
      startsAt,
      endsAt,
      usageLimit: f.usageLimit.trim() ? Number(f.usageLimit) : null,
      perUserLimit: Number(f.perUserLimit),
      isActive: f.isActive,
      isCollectible: f.isCollectible,
    };
    setBusy(true);
    try {
      if (row) await patch(`/admin/vouchers/${row.id}`, body);
      else await post('/admin/vouchers', body);
      toast(row ? 'Voucher saved' : 'Voucher created');
      onSaved();
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={row ? `Edit ${row.code}` : 'Add voucher'} wide>
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Code" error={errors.code} hint="Shoppers type this at checkout. Saved in capitals.">
            <Input value={f.code} maxLength={30} className="font-mono uppercase" onChange={(e) => set('code', e.target.value)} autoFocus={!row} />
          </Field>
          <Field label="Title" error={errors.title} hint="e.g. ৳200 off your first order">
            <Input value={f.title} maxLength={80} onChange={(e) => set('title', e.target.value)} />
          </Field>
        </div>
        <Field label="Description (optional)" hint="Internal note or terms shown under the voucher.">
          <Textarea value={f.description} maxLength={300} rows={2} className="min-h-0" onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type">
            <Select value={f.type} onChange={(e) => set('type', e.target.value as VoucherRow['type'])}>
              <option value="PERCENT">Percent off</option>
              <option value="FIXED">Fixed taka off</option>
              <option value="FREE_SHIPPING">Free delivery</option>
            </Select>
          </Field>
          {f.type === 'PERCENT' && (
            <>
              <Field label="Discount (%)" error={errors.value}>
                <Input type="number" inputMode="numeric" min={1} max={90} value={f.value} onChange={(e) => set('value', e.target.value)} />
              </Field>
              <Field label="Max discount (৳)" error={errors.maxDiscount} hint="Leave blank for no cap.">
                <Input type="number" inputMode="numeric" min={1} value={f.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} />
              </Field>
            </>
          )}
          {f.type === 'FIXED' && (
            <Field label="Discount (৳)" error={errors.value}>
              <Input type="number" inputMode="numeric" min={1} value={f.value} onChange={(e) => set('value', e.target.value)} />
            </Field>
          )}
          {f.type === 'FREE_SHIPPING' && <p className="self-end pb-2 text-sm text-ink-soft sm:col-span-2">Removes the delivery charge on qualifying orders.</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Minimum spend (৳)" error={errors.minSpend} hint="0 means any order.">
            <Input type="number" inputMode="numeric" min={0} value={f.minSpend} onChange={(e) => set('minSpend', e.target.value)} />
          </Field>
          <Field label="Total uses" error={errors.usageLimit} hint="Leave blank for no limit.">
            <Input type="number" inputMode="numeric" min={1} value={f.usageLimit} onChange={(e) => set('usageLimit', e.target.value)} />
          </Field>
          <Field label="Uses per customer" error={errors.perUserLimit}>
            <Input type="number" inputMode="numeric" min={1} max={100} value={f.perUserLimit} onChange={(e) => set('perUserLimit', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Starts (Dhaka time)" error={errors.startsAt}>
            <Input type="datetime-local" value={f.startsAt} onChange={(e) => set('startsAt', e.target.value)} />
          </Field>
          <Field label="Ends (Dhaka time)" error={errors.endsAt}>
            <Input type="datetime-local" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Toggle label="Active" hint="Switched-off vouchers cannot be applied." checked={f.isActive} onChange={(v) => set('isActive', v)} />
          <Toggle label="Collectible" hint="Shown on product and cart pages to collect." checked={f.isCollectible} onChange={(v) => set('isCollectible', v)} />
        </div>
        {row && row.usedCount > 0 && <p className="text-sm text-ink-soft">Used {row.usedCount} times. Changes apply to future orders only.</p>}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={busy}>
            {row ? 'Save voucher' : 'Create voucher'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
