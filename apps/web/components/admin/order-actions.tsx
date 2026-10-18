'use client';

import { Banknote, Check, FileText, Hand, PackageCheck, PhoneCall, Printer, Truck, X } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { InvoiceLinkButton } from '@/components/store/invoice-bits';
import { Button, Field, Input, Modal, Select, Textarea } from '@/components/ui';
import { post } from '@/lib/api';
import { tk } from '@/lib/format';
import { type BookingOrder, CourierBooking } from './courier-booking';
import type { CourierOption } from './types';
import { useAction } from './use-action';

export interface OrderActionProps {
  id: string;
  orderNo: string;
  status: string;
  nextStatuses: string[];
  couriers: string[];
  paymentMethod: string;
  paymentStatus: string;
  total: number;
  phone: string;
  needsCall: boolean;
  courier: string | null;
  trackingNo: string | null;
  /** Order details for the courier booking dialog. */
  booking: BookingOrder;
  /** GET /admin/couriers; null when it could not be loaded. */
  courierOptions: CourierOption[] | null;
  /** The invoice's share link. */
  invoiceUrl: string;
}

const CANCEL_REASONS = [
  'Customer asked to cancel',
  'Could not reach the customer',
  'Fake or duplicate order',
  'Item out of stock',
  'Address outside delivery area',
];
const FAIL_REASONS = ['Customer refused the parcel', 'Customer unreachable', 'Wrong or incomplete address', 'Customer not at home after 3 attempts'];

type Dialog = 'book' | 'ship' | 'deliver' | 'fail' | 'cancel' | 'refund' | null;

export function OrderActions(o: OrderActionProps) {
  const { run, busy } = useAction();
  const [dialog, setDialog] = useState<Dialog>(null);
  const can = (s: string) => o.nextStatuses.includes(s);
  const transition = (to: string, extra: Record<string, string> = {}, success = 'Order updated') =>
    run(to, () => post(`/admin/orders/${o.id}/transition`, { to, ...extra }), success).then((r) => {
      if (r) setDialog(null);
      return r;
    });

  const done = o.nextStatuses.length === 0;
  const codDue = o.paymentMethod === 'COD' && o.paymentStatus !== 'PAID';

  return (
    <div className="space-y-3">
      {can('CONFIRMED') && o.needsCall && (
        <p className="flex items-start gap-2 rounded-md bg-marigold-tint px-3 py-2 text-sm text-ink">
          <PhoneCall className="mt-0.5 size-4 shrink-0 text-marigold-dark" aria-hidden />
          <span>
            Call the customer on{' '}
            <a href={`tel:${o.phone}`} className="font-semibold tabular-nums underline">
              {o.phone}
            </a>{' '}
            before confirming. This cash on delivery order scored high for refusal risk.
          </span>
        </p>
      )}

      <div className="flex flex-col gap-2">
        {can('PLACED') && (
          <Button loading={busy === 'PLACED'} onClick={() => transition('PLACED', { note: 'Payment confirmed by staff' }, 'Marked as paid and placed')}>
            <Banknote className="size-4" /> Mark payment received
          </Button>
        )}
        {can('CONFIRMED') && (
          <Button loading={busy === 'CONFIRMED'} onClick={() => transition('CONFIRMED', {}, 'Order confirmed')}>
            <Check className="size-4" /> Confirm order
          </Button>
        )}
        {can('PACKED') && (
          <Button loading={busy === 'PACKED'} onClick={() => transition('PACKED', {}, 'Marked as packed')}>
            <PackageCheck className="size-4" /> Mark as packed
          </Button>
        )}
        {can('SHIPPED') && (
          <>
            <Button onClick={() => setDialog('book')}>
              <Truck className="size-4" /> Book courier
            </Button>
            <Button variant="outline" onClick={() => setDialog('ship')}>
              <Hand className="size-4" /> Ship without booking
            </Button>
          </>
        )}
        {can('DELIVERED') && (
          <Button onClick={() => setDialog('deliver')}>
            <Check className="size-4" /> Mark as delivered
          </Button>
        )}
        {can('DELIVERY_FAILED') && (
          <Button variant="outline" onClick={() => setDialog('fail')}>
            Mark delivery failed
          </Button>
        )}
        {o.paymentStatus === 'REFUND_PENDING' && (
          <Button variant="deal" onClick={() => setDialog('refund')}>
            <Banknote className="size-4" /> Mark refund sent
          </Button>
        )}
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="size-4" /> Print packing slip
        </Button>
        <a
          href={o.invoiceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-line bg-white px-4 text-[15px] font-semibold text-ink transition-colors hover:border-ink-faint"
        >
          <FileText className="size-4" /> Invoice
        </a>
        <InvoiceLinkButton url={o.invoiceUrl} orderNo={o.orderNo} mode="copy" />
        {can('CANCELLED') && (
          <Button variant="ghost" className="text-sindoor hover:bg-sindoor-tint hover:text-sindoor" onClick={() => setDialog('cancel')}>
            <X className="size-4" /> Cancel order
          </Button>
        )}
      </div>

      {done && o.paymentStatus !== 'REFUND_PENDING' && <p className="text-sm text-ink-soft">This order is closed. Add a note below if something changes.</p>}

      {dialog === 'book' && <CourierBooking order={o.booking} couriers={o.courierOptions} onClose={() => setDialog(null)} />}

      <ShipDialog
        open={dialog === 'ship'}
        onClose={() => setDialog(null)}
        couriers={o.couriers}
        busy={busy === 'SHIPPED'}
        onSubmit={(courier, trackingNo) => transition('SHIPPED', { courier, trackingNo }, `Shipped with ${courier}`)}
      />

      <Modal open={dialog === 'deliver'} onClose={() => setDialog(null)} title="Mark as delivered">
        <p className="text-ink">
          {codDue ? (
            <>
              Confirm the courier handed over order <strong>{o.orderNo}</strong> and collected <strong>{tk(o.total)}</strong> in cash.
            </>
          ) : (
            <>
              Confirm the courier handed over order <strong>{o.orderNo}</strong>.
            </>
          )}
        </p>
        <p className="mt-2 text-sm text-ink-soft">The customer earns order coins and can rate the items. This can&apos;t be undone.</p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDialog(null)}>
            Not yet
          </Button>
          <Button loading={busy === 'DELIVERED'} onClick={() => transition('DELIVERED', {}, 'Marked as delivered')}>
            Mark as delivered
          </Button>
        </div>
      </Modal>

      <ReasonDialog
        open={dialog === 'fail'}
        onClose={() => setDialog(null)}
        title="Mark delivery failed"
        presets={FAIL_REASONS}
        body="Stock goes back on the shelf, and any voucher or coins the customer used are returned to them."
        confirm="Mark delivery failed"
        busy={busy === 'DELIVERY_FAILED'}
        onSubmit={(reason) => transition('DELIVERY_FAILED', { reason }, 'Marked as delivery failed')}
      />

      <ReasonDialog
        open={dialog === 'cancel'}
        onClose={() => setDialog(null)}
        title={`Cancel order ${o.orderNo}`}
        presets={CANCEL_REASONS}
        body={
          o.paymentStatus === 'PAID'
            ? 'The customer has already paid, so the order moves to "Refund due" after cancelling. The customer sees this reason.'
            : 'Stock is released and the customer is told why. The customer sees this reason.'
        }
        confirm="Cancel order"
        danger
        busy={busy === 'CANCELLED'}
        onSubmit={(reason) => transition('CANCELLED', { reason }, 'Order cancelled')}
      />

      <RefundDialog
        open={dialog === 'refund'}
        onClose={() => setDialog(null)}
        amount={o.total}
        busy={busy === 'refund'}
        onSubmit={(note) =>
          run('refund', () => post(`/admin/orders/${o.id}/refunded`, note ? { note } : {}), 'Refund recorded').then((r) => {
            if (r) setDialog(null);
          })
        }
      />
    </div>
  );
}

function ShipDialog({
  open,
  onClose,
  couriers,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  couriers: string[];
  busy: boolean;
  onSubmit: (courier: string, trackingNo: string) => void;
}) {
  const [courier, setCourier] = useState(couriers[0] ?? '');
  const [tracking, setTracking] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!tracking.trim()) return setError('Enter the tracking or consignment number from the courier');
    setError(null);
    onSubmit(courier, tracking.trim());
  };
  return (
    <Modal open={open} onClose={onClose} title="Ship without booking">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-ink-soft">For your own riders, or a parcel you booked with the courier yourself. Nothing is sent to the courier.</p>
        <Field label="Courier">
          <Select value={courier} onChange={(e) => setCourier(e.target.value)}>
            {couriers.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Tracking number" error={error} hint="The customer gets this in their order update.">
          <Input value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={60} autoComplete="off" aria-invalid={!!error} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" loading={busy}>
            Mark as shipped
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ReasonDialog({
  open,
  onClose,
  title,
  body,
  presets,
  confirm,
  danger,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: string;
  presets: string[];
  confirm: string;
  danger?: boolean;
  busy: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [choice, setChoice] = useState('');
  const [other, setOther] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const reason = choice === 'other' ? other.trim() : choice;
    if (!reason) return setError(choice === 'other' ? 'Write the reason' : 'Pick a reason');
    setError(null);
    onSubmit(reason);
  };
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <p className="text-sm text-ink-soft">{body}</p>
        <fieldset>
          <legend className="mb-1 text-sm font-medium text-ink">Reason</legend>
          <div className="space-y-1">
            {[...presets, 'other'].map((r) => (
              <label key={r} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-[15px] hover:bg-paper">
                <input type="radio" name="reason" value={r} checked={choice === r} onChange={() => setChoice(r)} className="size-4 accent-padma" />
                {r === 'other' ? 'Something else' : r}
              </label>
            ))}
          </div>
        </fieldset>
        {choice === 'other' && (
          <Field label="Describe the reason">
            <Textarea value={other} onChange={(e) => setOther(e.target.value)} maxLength={200} className="min-h-20" autoFocus />
          </Field>
        )}
        {error && <p className="text-sm text-sindoor">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Keep order
          </Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} loading={busy}>
            {confirm}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function RefundDialog({ open, onClose, amount, busy, onSubmit }: { open: boolean; onClose: () => void; amount: number; busy: boolean; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Modal open={open} onClose={onClose} title="Mark refund sent">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(note.trim());
        }}
        className="space-y-4"
      >
        <p className="text-ink">
          Record that <strong>{tk(amount)}</strong> was sent back to the customer. They get a notification.
        </p>
        <Field label="Note (optional)" hint="For example the bKash transaction ID of the refund.">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button type="submit" loading={busy}>
            Mark refund sent
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function StaffNote({ orderId }: { orderId: string }) {
  const { run, busy } = useAction();
  const [note, setNote] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!note.trim()) return;
        const ok = await run('note', () => post(`/admin/orders/${orderId}/note`, { note: note.trim() }), 'Note added');
        if (ok) setNote('');
      }}
      className="space-y-2"
    >
      <Field label="Staff note" hint="Only staff see notes. They are added to the timeline.">
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-20" placeholder="e.g. Customer asked for delivery after 5 pm" />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="secondary" loading={busy === 'note'} disabled={!note.trim()}>
          Add note
        </Button>
      </div>
    </form>
  );
}
