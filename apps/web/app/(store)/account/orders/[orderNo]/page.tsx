import clsx from 'clsx';
import { Check, CircleCheck, FileText, LifeBuoy, TriangleAlert, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Countdown } from '@/components/store/countdown';
import { InvoiceLinkButton } from '@/components/store/invoice-bits';
import { CancelOrderButton, PayNowButton, ReturnButton } from '@/components/store/order-actions';
import { StatusBadge } from '@/components/store/order-bits';
import { Badge } from '@/components/ui';
import { dateTime, PAYMENT_LABEL, PAYMENT_STATUS_LABEL, RETURN_STATUS_LABEL, tk } from '@/lib/format';
import { mustGet, serverApi } from '@/lib/server';

interface OrderDetail {
  id: string;
  orderNo: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  shippingFee: number;
  shippingDiscount: number;
  discount: number;
  coinsUsed: number;
  total: number;
  voucherCode: string | null;
  shipName: string;
  shipPhone: string;
  shipDivision: string;
  shipDistrict: string;
  shipArea: string;
  shipLine: string;
  zoneLabel: string;
  courier: string | null;
  trackingNo: string | null;
  needsCall: boolean;
  expiresAt: string | null;
  placedAt: string;
  confirmedAt: string | null;
  packedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  canCancel: boolean;
  canPay: boolean;
  /** The invoice with its share key, so it opens for anyone the customer sends it to. */
  invoiceUrl: string;
  items: {
    id: string;
    productSlug: string;
    title: string;
    variantLabel: string | null;
    imageUrl: string | null;
    unitPrice: number;
    originalPrice: number;
    quantity: number;
    lineTotal: number;
    reviewed: boolean;
    review: { rating: number; comment: string } | null;
    returns: { id: string; status: string; quantity: number; reason: string }[];
    returnUntil: string | null;
    canReturn: boolean;
    returnableQty: number;
  }[];
  events: { id: string; status: string | null; title: string; note: string | null; actor: string; createdAt: string }[];
  /** Latest courier consignment, with its newest events first. */
  shipments?: Shipment[];
}

type ShipmentState = 'BOOKED' | 'IN_TRANSIT' | 'DELIVERED' | 'PARTIAL' | 'RETURNED' | 'CANCELLED';

interface Shipment {
  courier: string;
  trackingCode: string;
  state: ShipmentState;
  events: { status: string; message: string | null; createdAt: string }[];
}

const COURIER_NAME: Record<string, string> = { steadfast: 'Steadfast', pathao: 'Pathao', redx: 'RedX', test: 'Test courier' };

const SHIPMENT_STATE: Record<ShipmentState, { label: string; text: string; tone: 'green' | 'red' | 'blue' | 'neutral' | 'amber' }> = {
  BOOKED: { label: 'Waiting for pickup', text: 'Booked with the courier. They will pick it up from us soon.', tone: 'neutral' },
  IN_TRANSIT: { label: 'On the way', text: 'Your parcel is with the courier and on its way to you.', tone: 'blue' },
  DELIVERED: { label: 'Delivered', text: 'The courier delivered your parcel.', tone: 'green' },
  PARTIAL: { label: 'Partly delivered', text: 'Part of the parcel was delivered.', tone: 'amber' },
  RETURNED: { label: 'Returned', text: 'The parcel is going back to us.', tone: 'red' },
  CANCELLED: { label: 'Cancelled', text: 'The courier booking was cancelled.', tone: 'red' },
};

/** Courier status codes like "in_transit" read better as words. Staff names stay out of view. */
function eventText(e: Shipment['events'][number]) {
  const words = (s: string) => {
    const t = s.replace(/[_-]+/g, ' ').trim();
    return t ? t[0].toUpperCase() + t.slice(1) : 'Update from the courier';
  };
  if (!e.message) return words(e.status);
  if (/^booked by /i.test(e.message)) return 'Booked with the courier';
  if (/^simulated by /i.test(e.message)) return words(e.status);
  return e.message;
}

type Props = { params: Promise<{ orderNo: string }>; searchParams: Promise<{ placed?: string; payment?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orderNo } = await params;
  return { title: `Order ${orderNo}` };
}

const NOTICES: Record<string, { tone: 'good' | 'bad' | 'warn'; text: string }> = {
  placed: { tone: 'good', text: 'Thank you! Your order is placed. We sent the details to your notifications.' },
  success: { tone: 'good', text: 'Payment received. Your order is confirmed.' },
  failed: { tone: 'bad', text: 'The payment did not go through. You can try again before the payment window closes.' },
  cancelled: { tone: 'warn', text: 'You left the payment page. Your order is waiting for payment.' },
  pending: { tone: 'warn', text: 'We are confirming your payment with the bank. This page will update shortly.' },
};

export default async function OrderPage({ params, searchParams }: Props) {
  const { orderNo } = await params;
  const sp = await searchParams;
  const [o, store] = await Promise.all([mustGet<OrderDetail>(`/orders/${orderNo}`), serverApi<{ returnReasons: string[] }>('/store')]);
  const notice = sp.placed ? NOTICES.placed : sp.payment ? NOTICES[sp.payment] : null;

  const steps = [
    { label: 'Placed', at: o.placedAt },
    { label: 'Confirmed', at: o.confirmedAt },
    { label: 'Packed', at: o.packedAt },
    { label: 'Shipped', at: o.shippedAt },
    { label: 'Delivered', at: o.deliveredAt },
  ];
  const stopped = o.status === 'CANCELLED' || o.status === 'DELIVERY_FAILED';
  const reached = steps.filter((s) => s.at).length;
  const shipment = o.shipments?.[0] ?? null;

  return (
    <div className="space-y-4">
      {notice && (
        <div
          className={clsx(
            'flex items-start gap-2 rounded-[var(--radius-card)] px-4 py-3 text-[15px]',
            notice.tone === 'good' && 'bg-padma-tint text-padma-dark',
            notice.tone === 'bad' && 'bg-sindoor-tint text-sindoor',
            notice.tone === 'warn' && 'bg-marigold-tint text-ink',
          )}
          role="status"
        >
          {notice.tone === 'good' ? <CircleCheck className="mt-0.5 size-5 shrink-0" /> : <TriangleAlert className="mt-0.5 size-5 shrink-0" />}
          {notice.text}
        </div>
      )}

      <section className="rounded-[var(--radius-card)] border border-line bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Order {o.orderNo}</h1>
            <p className="text-[15px] text-ink-soft">Placed {dateTime(o.placedAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={o.status} />
            {o.canPay && <PayNowButton orderNo={o.orderNo} />}
            {o.canCancel && <CancelOrderButton orderNo={o.orderNo} />}
            <Link href={o.invoiceUrl ?? `/invoice/${o.orderNo}`} target="_blank" className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line px-3 text-[15px] font-semibold hover:border-ink-faint">
              <FileText className="size-4" /> Invoice
            </Link>
            {o.invoiceUrl && <InvoiceLinkButton url={o.invoiceUrl} orderNo={o.orderNo} className="px-3" />}
            <Link
              href={`/account/support/new?order=${encodeURIComponent(o.orderNo)}`}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-line px-3 text-[15px] font-semibold hover:border-ink-faint"
            >
              <LifeBuoy className="size-4" /> Get help with this order
            </Link>
          </div>
        </div>

        {o.canPay && o.expiresAt && (
          <p className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-marigold-tint px-3 py-2 text-[15px]">
            Pay {tk(o.total)} within <Countdown to={o.expiresAt} /> or the order is cancelled automatically.
          </p>
        )}
        {o.status === 'PLACED' && o.needsCall && (
          <p className="mt-3 rounded-md bg-marigold-tint px-3 py-2 text-[15px]">We'll call {o.shipPhone} to confirm this order before packing.</p>
        )}

        {stopped ? (
          <div className="mt-5 rounded-md bg-sindoor-tint px-4 py-3 text-[15px] text-sindoor">
            <p className="font-semibold">{o.status === 'CANCELLED' ? 'This order was cancelled' : 'The courier could not deliver this order'}</p>
            {o.cancelReason && <p className="text-ink-soft">{o.cancelReason}</p>}
            {o.paymentStatus === 'REFUND_PENDING' && <p className="mt-1 text-ink">Your payment of {tk(o.total)} will be refunded to the original method.</p>}
            {o.paymentStatus === 'REFUNDED' && <p className="mt-1 text-ink">Refunded {tk(o.total)}.</p>}
          </div>
        ) : (
          o.status !== 'AWAITING_PAYMENT' && (
            <ol className="mt-6 grid grid-cols-5" aria-label="Delivery progress">
              {steps.map((s, i) => {
                const done = !!s.at;
                return (
                  <li key={s.label} className="relative flex flex-col items-center text-center">
                    {i > 0 && <span className={clsx('absolute right-1/2 top-3.5 h-0.5 w-full -translate-y-1/2', i < reached ? 'bg-padma' : 'bg-line')} aria-hidden />}
                    <span className={clsx('relative z-10 flex size-7 items-center justify-center rounded-full border-2', done ? 'border-padma bg-padma text-white' : 'border-line bg-white')}>
                      {done && <Check className="size-4" strokeWidth={3} />}
                    </span>
                    <span className={clsx('mt-1.5 text-sm', done ? 'font-semibold' : 'text-ink-faint')}>{s.label}</span>
                    {s.at && <span className="hidden text-xs text-ink-soft sm:block">{dateTime(s.at)}</span>}
                  </li>
                );
              })}
            </ol>
          )
        )}

        {shipment ? (
          <CourierUpdates shipment={shipment} />
        ) : (
          o.courier &&
          o.trackingNo && (
            <p className="mt-5 flex flex-wrap items-center gap-x-2 rounded-md bg-paper px-3 py-2 text-[15px]">
              <Truck className="size-5 text-padma" />
              {o.courier}, tracking number <span className="font-semibold">{o.trackingNo}</span>
            </p>
          )
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
        <section className="rounded-[var(--radius-card)] border border-line bg-white" aria-labelledby="items-h">
          <h2 id="items-h" className="border-b border-line px-4 py-3 font-semibold sm:px-5">
            Items
          </h2>
          <ul className="divide-y divide-line">
            {o.items.map((i) => (
              <li key={i.id} className="flex gap-3 px-4 py-3 sm:px-5">
                <Link href={`/product/${i.productSlug}`} className="size-16 shrink-0 overflow-hidden rounded bg-paper">
                  {i.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.imageUrl} alt="" className="size-full object-cover" />
                  )}
                </Link>
                <div className="min-w-0 flex-1 text-[15px]">
                  <Link href={`/product/${i.productSlug}`} className="line-clamp-2 hover:text-padma">
                    {i.title}
                  </Link>
                  <p className="text-sm text-ink-soft">
                    {i.variantLabel ? `${i.variantLabel}, ` : ''}
                    {tk(i.unitPrice)} × {i.quantity}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-3">
                    {o.status === 'DELIVERED' && !i.reviewed && (
                      <Link href="/account/reviews" className="text-sm font-semibold text-padma hover:underline">
                        Write a review
                      </Link>
                    )}
                    {i.review && <span className="text-sm text-ink-soft">You rated it {i.review.rating}/5</span>}
                    {i.canReturn && store && <ReturnButton item={i} reasons={store.returnReasons} />}
                    {o.status === 'DELIVERED' && !i.returnUntil && <span className="text-sm text-ink-faint">Not returnable</span>}
                    {i.returns.map((r) => (
                      <Badge key={r.id} tone={r.status === 'REJECTED' ? 'red' : r.status === 'REFUNDED' ? 'green' : 'amber'}>
                        Return {RETURN_STATUS_LABEL[r.status].toLowerCase()}
                      </Badge>
                    ))}
                  </div>
                </div>
                <p className="text-[15px] font-semibold">{tk(i.lineTotal)}</p>
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-4">
          <section className="rounded-[var(--radius-card)] border border-line bg-white p-4" aria-labelledby="pay-h">
            <h2 id="pay-h" className="mb-2 font-semibold">
              Payment
            </h2>
            <dl className="space-y-1.5 text-[15px]">
              <div className="flex justify-between">
                <dt className="text-ink-soft">Subtotal</dt>
                <dd>{tk(o.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">Delivery ({o.zoneLabel})</dt>
                <dd>{tk(o.shippingFee)}</dd>
              </div>
              {o.shippingDiscount > 0 && (
                <div className="flex justify-between text-padma">
                  <dt>Delivery discount</dt>
                  <dd>-{tk(o.shippingDiscount)}</dd>
                </div>
              )}
              {o.discount > 0 && (
                <div className="flex justify-between text-padma">
                  <dt>Voucher {o.voucherCode}</dt>
                  <dd>-{tk(o.discount)}</dd>
                </div>
              )}
              {o.coinsUsed > 0 && (
                <div className="flex justify-between text-padma">
                  <dt>Coins</dt>
                  <dd>-{tk(o.coinsUsed)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-line pt-2 text-base">
                <dt className="font-semibold">Total</dt>
                <dd className="font-bold text-sindoor">{tk(o.total)}</dd>
              </div>
              <div className="flex justify-between pt-1 text-sm">
                <dt className="text-ink-soft">{PAYMENT_LABEL[o.paymentMethod]}</dt>
                <dd className="font-semibold">{PAYMENT_STATUS_LABEL[o.paymentStatus]}</dd>
              </div>
            </dl>
          </section>
          <section className="rounded-[var(--radius-card)] border border-line bg-white p-4 text-[15px]" aria-labelledby="addr-h">
            <h2 id="addr-h" className="mb-2 font-semibold">
              Delivery address
            </h2>
            <p className="font-medium">{o.shipName}</p>
            <p className="text-ink-soft">{o.shipPhone}</p>
            <p className="text-ink-soft">
              {o.shipLine}, {o.shipArea}, {o.shipDistrict}, {o.shipDivision}
            </p>
          </section>
          <section className="rounded-[var(--radius-card)] border border-line bg-white p-4" aria-labelledby="hist-h">
            <h2 id="hist-h" className="mb-3 font-semibold">
              History
            </h2>
            <ol className="relative space-y-4 border-l-2 border-line pl-4">
              {[...o.events].reverse().map((e, i) => (
                <li key={e.id} className="relative text-[15px]">
                  <span className={clsx('absolute -left-[23px] top-1.5 size-3 rounded-full ring-4 ring-white', i === 0 ? 'bg-padma' : 'bg-ink-faint')} />
                  <p className={clsx(i === 0 && 'font-semibold')}>{e.title}</p>
                  {e.note && <p className="text-sm text-ink-soft">{e.note}</p>}
                  <p className="text-xs text-ink-faint">{dateTime(e.createdAt)}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

function CourierUpdates({ shipment }: { shipment: Shipment }) {
  const state = SHIPMENT_STATE[shipment.state] ?? SHIPMENT_STATE.BOOKED;
  return (
    <div className="mt-5 rounded-md border border-line" aria-labelledby="courier-h">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-line bg-paper px-3 py-2.5">
        <Truck className="mt-0.5 size-5 shrink-0 text-padma" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="courier-h" className="font-semibold">
            Courier updates
          </h2>
          <p className="text-sm text-ink-soft">
            {COURIER_NAME[shipment.courier] ?? shipment.courier}, tracking number <span className="font-semibold text-ink">{shipment.trackingCode}</span>
          </p>
        </div>
        <Badge tone={state.tone}>{state.label}</Badge>
      </div>
      <p className="border-b border-line px-3 py-2 text-[15px]">{state.text}</p>
      {shipment.events.length === 0 ? (
        <p className="px-3 py-2.5 text-sm text-ink-soft">Updates from the courier will show here.</p>
      ) : (
        <ol className="divide-y divide-line">
          {shipment.events.map((e, i) => (
            <li key={`${e.createdAt}-${i}`} className="flex flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-[15px]">
              <span className={clsx('min-w-0 break-words', i === 0 ? 'font-semibold' : 'text-ink')}>{eventText(e)}</span>
              <span className="shrink-0 text-xs text-ink-faint">{dateTime(e.createdAt)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
