import clsx from 'clsx';
import { ArrowLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { OrderStatusBadge, Panel, paymentLabel, PaymentStatusBadge, ReturnStatusBadge, RiskBadge, Row, Table, TableWrap, Td, Th, Thumb, type Tone } from '@/components/admin/bits';
import { OrderActions, StaffNote } from '@/components/admin/order-actions';
import { PackingSlip } from '@/components/admin/packing-slip';
import { ShipmentPanel } from '@/components/admin/shipment-panel';
import { AdminHeader } from '@/components/admin/shell';
import { Badge } from '@/components/ui';
import { date, dateTime, ORDER_STATUS_LABEL, tk } from '@/lib/format';
import { mustGet, serverApi } from '@/lib/server';
import type { AdminOrder, CourierOption, TicketStatus } from '@/components/admin/types';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const o = await serverApi<AdminOrder>(`/admin/orders/${id}`);
  return { title: o ? `Order ${o.orderNo}` : 'Order' };
}

const ACTOR: Record<string, string> = { admin: 'Staff', customer: 'Customer', system: 'System' };

const TICKET: Record<TicketStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'Needs a reply', tone: 'amber' },
  PENDING: { label: 'Waiting on customer', tone: 'blue' },
  RESOLVED: { label: 'Resolved', tone: 'green' },
};

export default async function OrderDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [o, settings, store, couriers] = await Promise.all([
    mustGet<AdminOrder>(`/admin/orders/${id}`),
    serverApi<{ cod: { callThreshold: number; advanceThreshold: number } }>('/admin/settings'),
    serverApi<{ store: { name: string; supportPhone: string } }>('/store'),
    // The page still works without it; booking then explains it could not load couriers.
    serverApi<CourierOption[]>('/admin/couriers').catch(() => null),
  ]);
  const callAt = settings?.cod.callThreshold ?? 40;
  const advanceAt = settings?.cod.advanceThreshold ?? 70;
  const h = o.customerHistory;
  const pastTotal = Object.values(h).reduce((a, b) => a + b, 0);
  const bad = (h.DELIVERY_FAILED ?? 0) + (h.CANCELLED ?? 0);
  const units = o.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <>
      <div className="no-print">
        <Link href="/admin/orders" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
          <ArrowLeft className="size-4" /> Orders
        </Link>
        <AdminHeader
          title={`Order ${o.orderNo}`}
          description={`Placed ${dateTime(o.createdAt)} by ${o.shipName}`}
          actions={
            <div className="flex items-center gap-2">
              <OrderStatusBadge status={o.status} />
              <PaymentStatusBadge status={o.paymentStatus} />
            </div>
          }
        />

        {o.cancelReason && (o.status === 'CANCELLED' || o.status === 'DELIVERY_FAILED') && (
          <p className="mb-4 rounded-[6px] border border-sindoor/30 bg-sindoor-tint px-4 py-2.5 text-sm text-ink">
            <span className="font-semibold text-sindoor">{ORDER_STATUS_LABEL[o.status]}:</span> {o.cancelReason}
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:grid-rows-[auto_1fr]">
          <div className="min-w-0 space-y-4 lg:col-start-2 lg:row-start-1">
            <Panel title="Next step" bodyClassName="p-4">
              <OrderActions
                id={o.id}
                orderNo={o.orderNo}
                status={o.status}
                nextStatuses={o.nextStatuses}
                couriers={o.couriers}
                paymentMethod={o.paymentMethod}
                paymentStatus={o.paymentStatus}
                total={o.total}
                phone={o.shipPhone}
                needsCall={o.needsCall}
                courier={o.courier}
                trackingNo={o.trackingNo}
                courierOptions={couriers}
                invoiceUrl={o.invoiceUrl}
                booking={{
                  id: o.id,
                  orderNo: o.orderNo,
                  shipName: o.shipName,
                  shipPhone: o.shipPhone,
                  shipLine: o.shipLine,
                  shipArea: o.shipArea,
                  shipDistrict: o.shipDistrict,
                  total: o.total,
                  paymentStatus: o.paymentStatus,
                  note: o.note,
                }}
              />
              {o.courier && o.shipments.length === 0 && (
                <dl className="mt-4 border-t border-line pt-3 text-sm">
                  <Row label="Courier">{o.courier}</Row>
                  <Row label="Tracking">
                    <span className="font-mono text-xs">{o.trackingNo}</span>
                  </Row>
                </dl>
              )}
            </Panel>

            {o.shipments.length > 0 && (
              <ShipmentPanel
                shipments={o.shipments}
                couriers={couriers}
                orderStatus={o.status}
                booking={{
                  id: o.id,
                  orderNo: o.orderNo,
                  shipName: o.shipName,
                  shipPhone: o.shipPhone,
                  shipLine: o.shipLine,
                  shipArea: o.shipArea,
                  shipDistrict: o.shipDistrict,
                  total: o.total,
                  paymentStatus: o.paymentStatus,
                  note: o.note,
                }}
              />
            )}
          </div>

          <div className="min-w-0 space-y-4 lg:col-start-1 lg:row-span-2 lg:row-start-1">
            <Panel title={`Items (${units})`}>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Product</Th>
                      <Th>SKU</Th>
                      <Th align="right">Unit price</Th>
                      <Th align="right">Qty</Th>
                      <Th align="right">Total</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.items.map((i) => (
                      <tr key={i.id}>
                        <Td>
                          <div className="flex min-w-56 items-center gap-3">
                            <Thumb src={i.imageUrl} size={48} />
                            <div className="min-w-0">
                              <Link href={`/product/${i.variant.product.slug}`} target="_blank" className="font-medium text-ink hover:text-padma hover:underline">
                                {i.title}
                              </Link>
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                                {i.variantLabel && <span>{i.variantLabel}</span>}
                                {i.flashSaleItemId && <Badge tone="amber">Flash sale</Badge>}
                                {i.returns.map((r) => (
                                  <ReturnStatusBadge key={r.id} status={r.status} />
                                ))}
                              </div>
                            </div>
                          </div>
                        </Td>
                        <Td className="whitespace-nowrap">
                          <span className="font-mono text-xs">{i.variant.sku}</span>
                          <span className="block text-xs text-ink-soft">{i.variant.stock} in stock</span>
                        </Td>
                        <Td num className="whitespace-nowrap">
                          {tk(i.unitPrice)}
                          {i.originalPrice > i.unitPrice && <span className="block text-xs text-ink-faint line-through">{tk(i.originalPrice)}</span>}
                        </Td>
                        <Td num>{i.quantity}</Td>
                        <Td num className="font-medium whitespace-nowrap">
                          {tk(i.lineTotal)}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <div className="text-sm">
                  {o.note && (
                    <div className="rounded-md bg-marigold-tint px-3 py-2">
                      <p className="text-xs font-semibold text-marigold-dark">Customer note</p>
                      <p className="text-ink">{o.note}</p>
                    </div>
                  )}
                </div>
                <dl className="text-sm">
                  <Row label="Subtotal">{tk(o.subtotal)}</Row>
                  <Row label={`Delivery (${o.zoneLabel})`}>{tk(o.shippingFee)}</Row>
                  {o.shippingDiscount > 0 && <Row label="Delivery discount">−{tk(o.shippingDiscount)}</Row>}
                  {o.discount > 0 && <Row label={o.voucherCode ? `Voucher ${o.voucherCode}` : 'Discount'}>−{tk(o.discount)}</Row>}
                  {o.coinsUsed > 0 && <Row label="Coins used">−{tk(o.coinsUsed)}</Row>}
                  <Row label="Total" strong className="mt-1 border-t border-line pt-2 text-base">
                    {tk(o.total)}
                  </Row>
                  <Row label="Payment">{paymentLabel(o.paymentMethod)}</Row>
                </dl>
              </div>
            </Panel>

            <Panel title="Payments">
              {o.payments.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-soft">No payment attempts recorded yet.</p>
              ) : (
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th>Date</Th>
                        <Th>Method</Th>
                        <Th>Provider</Th>
                        <Th>Transaction</Th>
                        <Th align="right">Amount</Th>
                        <Th>Status</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {o.payments.map((p) => (
                        <tr key={p.id}>
                          <Td className="whitespace-nowrap text-ink-soft">{dateTime(p.createdAt)}</Td>
                          <Td className="whitespace-nowrap">{paymentLabel(p.method)}</Td>
                          <Td className="text-ink-soft">{p.provider === 'cod' ? 'Cash' : p.provider === 'mock' ? 'Test gateway' : p.provider === 'sslcommerz' ? 'SSLCommerz' : p.provider}</Td>
                          <Td className="font-mono text-xs text-ink-soft">{p.providerTxnId ?? 'None'}</Td>
                          <Td num>{tk(p.amount)}</Td>
                          <Td>
                            <PaymentStatusBadge status={p.status} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              )}
            </Panel>

            {o.returns.length > 0 && (
              <Panel
                title="Returns"
                actions={
                  <Link href="/admin/returns" className="text-sm font-medium text-padma hover:underline">
                    Open returns
                  </Link>
                }
                bodyClassName="divide-y divide-line"
              >
                {o.returns.map((r) => {
                  const item = o.items.find((i) => i.id === r.orderItemId);
                  return (
                    <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span>
                        {r.quantity} × {item?.title ?? 'Item'}
                        <span className="block text-xs text-ink-soft">
                          {r.reason}, requested {date(r.createdAt)}
                        </span>
                      </span>
                      <ReturnStatusBadge status={r.status} />
                    </div>
                  );
                })}
              </Panel>
            )}

            <Panel title="Timeline" bodyClassName="px-4 py-4">
              <ol className="relative space-y-4 border-l border-line pl-5">
                {o.events.map((e, idx) => (
                  <li key={e.id} className="relative">
                    <span
                      className={clsx(
                        'absolute top-1.5 -left-[25px] size-2.5 rounded-full ring-4 ring-white',
                        idx === o.events.length - 1 ? 'bg-padma' : e.internal || e.title === 'Staff note' ? 'bg-marigold' : 'bg-[#c9cfcb]',
                      )}
                      aria-hidden
                    />
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[15px] font-medium text-ink">
                      {e.title}
                      {e.internal && <Badge tone="amber">Staff only</Badge>}
                    </p>
                    {e.note && <p className="text-sm whitespace-pre-line text-ink">{e.note}</p>}
                    <p className="text-xs text-ink-soft">
                      {dateTime(e.createdAt)}, {e.actor === 'admin' && e.actorName ? `Staff · ${e.actorName}` : (ACTOR[e.actor] ?? e.actor)}
                    </p>
                  </li>
                ))}
              </ol>
            </Panel>
          </div>

          <div className="min-w-0 space-y-4 lg:col-start-2 lg:row-start-2">
            <Panel title="Delivery" bodyClassName="p-4 text-sm">
              <p className="font-semibold text-ink">{o.shipName}</p>
              <a href={`tel:${o.shipPhone}`} className="text-padma tabular-nums hover:underline">
                {o.shipPhone}
              </a>
              <address className="mt-2 not-italic text-ink">
                {o.shipLine}
                <br />
                {o.shipArea}, {o.shipDistrict}
                <br />
                {o.shipDivision} division
              </address>
              <p className="mt-2">
                <Badge tone="neutral">{o.zoneLabel}</Badge>
              </p>
            </Panel>

            <Panel title="Customer" bodyClassName="p-4 text-sm">
              <p className="font-semibold text-ink">{o.user.name}</p>
              <p className="text-ink-soft tabular-nums">{o.user.phone}</p>
              {o.user.email && <p className="text-ink-soft">{o.user.email}</p>}
              <p className="mt-1 text-xs text-ink-soft">Customer since {date(o.user.createdAt)}</p>
              {o.user.codBlocked && (
                <p className="mt-2">
                  <Badge tone="red">Cash on delivery blocked</Badge>
                </p>
              )}
              <Link href={`/admin/customers?q=${encodeURIComponent(o.user.phone)}`} className="mt-2 inline-block font-medium text-padma hover:underline">
                View customer
              </Link>
            </Panel>

            {o.tickets.length > 0 && (
              <Panel title="Support requests" bodyClassName="divide-y divide-line">
                {o.tickets.map((t) => (
                  <Link key={t.id} href={`/admin/tickets/${t.id}`} className="group flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-paper focus-visible:bg-paper">
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-medium text-ink group-hover:text-padma">{t.subject}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                        <Badge tone={TICKET[t.status]?.tone ?? 'neutral'}>{TICKET[t.status]?.label ?? t.status}</Badge>
                        <span>
                          <span className="font-mono">{t.ticketNo}</span>, {date(t.createdAt)}
                        </span>
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-ink-faint group-hover:text-ink" aria-hidden />
                  </Link>
                ))}
              </Panel>
            )}

            <Panel title="Cash on delivery risk" bodyClassName="p-4 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-soft">Score at checkout</span>
                <RiskBadge score={o.riskScore} callAt={callAt} advanceAt={advanceAt} />
              </div>
              <p className="mt-1 text-xs text-ink-soft">
                Orders at {callAt} or above need a confirmation call. At {advanceAt} or above cash on delivery is not offered.
              </p>
              <h3 className="mt-4 mb-1 text-sm font-semibold text-ink">Other orders from this customer or phone</h3>
              {pastTotal === 0 ? (
                <p className="text-ink-soft">This is their first order.</p>
              ) : (
                <dl>
                  {['DELIVERED', 'DELIVERY_FAILED', 'CANCELLED', 'SHIPPED', 'PACKED', 'CONFIRMED', 'PLACED', 'AWAITING_PAYMENT']
                    .filter((s) => h[s])
                    .map((s) => (
                      <Row key={s} label={ORDER_STATUS_LABEL[s]}>
                        <span className={clsx((s === 'DELIVERY_FAILED' || s === 'CANCELLED') && 'font-semibold text-sindoor')}>{h[s]}</span>
                      </Row>
                    ))}
                </dl>
              )}
              {bad >= 2 && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-sindoor">
                  <ShieldAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {bad} past orders were cancelled or refused. Consider asking for advance payment.
                </p>
              )}
            </Panel>

            <Panel bodyClassName="p-4">
              <StaffNote orderId={o.id} />
            </Panel>
          </div>
        </div>
      </div>

      <PackingSlip order={o} storeName={store?.store.name ?? 'Tuktak Bazaar'} supportPhone={store?.store.supportPhone ?? ''} />
    </>
  );
}
