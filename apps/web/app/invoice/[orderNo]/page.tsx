import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PrintButton } from '@/components/store/print-button';
import { SwitchAccountButton } from '@/components/store/invoice-bits';
import { dateTime, PAYMENT_LABEL, PAYMENT_STATUS_LABEL, tk } from '@/lib/format';
import { getMe, serverApi, serverGet } from '@/lib/server';
import { BRAND_BN } from '@/components/store/logo';

type Props = { params: Promise<{ orderNo: string }>; searchParams: Promise<{ key?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orderNo } = await params;
  // Share links carry a key in the URL: keep it out of the Referer sent to other sites.
  return { title: `Invoice ${orderNo}`, robots: { index: false }, referrer: 'no-referrer' };
}

interface Invoice {
  /** How this visitor may see it: the customer, store staff, or someone holding the share link. */
  viewer: 'owner' | 'staff' | 'link';
  orderNo: string;
  placedAt: string;
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
  shipLine: string;
  shipArea: string;
  shipDistrict: string;
  shipDivision: string;
  items: { id: string; title: string; variantLabel: string | null; unitPrice: number; quantity: number; lineTotal: number }[];
}

export default async function InvoicePage({ params, searchParams }: Props) {
  const [{ orderNo }, { key: rawKey }] = await Promise.all([params, searchParams]);
  const key = typeof rawKey === 'string' ? rawKey : undefined;
  const self = `/invoice/${encodeURIComponent(orderNo)}${key ? `?key=${encodeURIComponent(key)}` : ''}`;
  const [res, store] = await Promise.all([
    serverGet<Invoice>(`/orders/${encodeURIComponent(orderNo)}/invoice${key ? `?key=${encodeURIComponent(key)}` : ''}`),
    serverApi<{ store: { name: string; supportPhone: string; supportEmail: string } }>('/store'),
  ]);
  if (res.status === 401) redirect(`/login?next=${encodeURIComponent(self)}`);
  if (!res.data) return <InvoiceUnavailable self={self} hasKey={!!key} />;
  const o = res.data;
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-ink print:p-0">
      <div className="flex items-start justify-between border-b-2 border-padma pb-4">
        <div>
          <p className="font-brand text-4xl leading-none text-padma">{BRAND_BN}</p>
          <p className="mt-1 text-lg font-bold">{store?.store.name ?? 'Tuktak Bazaar'}</p>
          <p className="text-sm text-ink-soft">
            {store?.store.supportPhone}, {store?.store.supportEmail}
          </p>
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-bold">Invoice</h1>
          <p className="text-sm">Order {o.orderNo}</p>
          <p className="text-sm text-ink-soft">{dateTime(o.placedAt)}</p>
          <div className="no-print mt-2">
            <PrintButton />
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-6 text-sm">
        <div>
          <p className="mb-1 font-semibold">Deliver to</p>
          <p>{o.shipName}</p>
          <p>{o.shipPhone}</p>
          <p>
            {o.shipLine}, {o.shipArea}, {o.shipDistrict}, {o.shipDivision}
          </p>
        </div>
        <div className="text-right">
          <p className="mb-1 font-semibold">Payment</p>
          <p>{PAYMENT_LABEL[o.paymentMethod]}</p>
          <p>{PAYMENT_STATUS_LABEL[o.paymentStatus]}</p>
        </div>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-ink-soft">
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 text-right font-medium">Price</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {o.items.map((i) => (
            <tr key={i.id} className="border-b border-line">
              <td className="py-2 pr-4">
                {i.title}
                {i.variantLabel && <span className="block text-xs text-ink-soft">{i.variantLabel}</span>}
              </td>
              <td className="py-2 text-right tabular-nums">{tk(i.unitPrice)}</td>
              <td className="py-2 text-right tabular-nums">{i.quantity}</td>
              <td className="py-2 text-right tabular-nums">{tk(i.lineTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="ml-auto mt-4 w-64 space-y-1 text-sm">
        <Line label="Subtotal" value={tk(o.subtotal)} />
        <Line label="Delivery" value={tk(o.shippingFee)} />
        {o.shippingDiscount > 0 && <Line label="Delivery discount" value={`-${tk(o.shippingDiscount)}`} />}
        {o.discount > 0 && <Line label={`Voucher ${o.voucherCode ?? ''}`} value={`-${tk(o.discount)}`} />}
        {o.coinsUsed > 0 && <Line label="Coins" value={`-${tk(o.coinsUsed)}`} />}
        <div className="flex justify-between border-t-2 border-ink pt-1 text-base font-bold">
          <dt>Total</dt>
          <dd>{tk(o.total)}</dd>
        </div>
      </dl>
      <p className="mt-10 text-center text-xs text-ink-faint">Prices include VAT. Thank you for shopping with {store?.store.name ?? 'Tuktak Bazaar'}.</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-ink-soft">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

/** Shown when the order doesn't exist, isn't on this account, or the share link is broken; one message for all three. */
async function InvoiceUnavailable({ self, hasKey }: { self: string; hasKey: boolean }) {
  const { user } = await getMe();
  const firstName = user?.name.split(' ')[0];
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="font-brand text-5xl text-padma sm:text-6xl">{BRAND_BN}</p>
      <h1 className="mt-4 text-2xl font-bold">This invoice isn&apos;t available</h1>
      <p className="mt-2 max-w-md text-ink-soft">
        {hasKey ? 'The link may be incomplete or copied wrongly. ' : 'It may belong to a different account. '}
        {user
          ? `You're signed in as ${firstName}. Sign in with the account that placed the order, or ask them to send the invoice link again.`
          : 'Sign in with the account that placed the order, or ask them to send the invoice link again.'}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {user ? (
          <>
            <SwitchAccountButton next={self} />
            <Link href="/account/orders" className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-[15px] font-semibold hover:border-ink-faint">
              My orders
            </Link>
          </>
        ) : (
          <>
            <Link href={`/login?next=${encodeURIComponent(self)}`} className="inline-flex h-10 items-center rounded-md bg-padma px-4 text-[15px] font-semibold text-white hover:bg-padma-dark">
              Sign in
            </Link>
            <Link href="/" className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-[15px] font-semibold hover:border-ink-faint">
              Go to the home page
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
