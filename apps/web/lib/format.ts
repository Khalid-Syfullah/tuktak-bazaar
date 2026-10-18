const taka = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** ৳1,24,990 — lakh grouping as used in Bangladesh. */
export function tk(amount: number | null | undefined): string {
  return `৳${taka.format(Math.round(amount ?? 0))}`;
}

/** 0–9 → ০–৯, for numbers inside Bangla text. */
export function bn(value: number | string): string {
  return String(value).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);
}

/** ৳১,২৪,৯৯০ — taka with lakh grouping and Bangla digits, for Bangla text. */
export function tkBn(amount: number | null | undefined): string {
  return bn(tk(amount));
}

export function compactCount(n: number): string {
  if (n >= 100000) return `${(n / 100000).toFixed(n >= 1000000 ? 0 : 1).replace(/\.0$/, '')} lakh`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dhaka' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Dhaka',
});

export function date(value: string | Date | null | undefined): string {
  return value ? dateFmt.format(new Date(value)) : '';
}

export function dateTime(value: string | Date | null | undefined): string {
  return value ? dateTimeFmt.format(new Date(value)) : '';
}

export function relative(value: string | Date): string {
  const diff = Date.now() - new Date(value).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return date(value);
}

export const ORDER_STATUS_LABEL: Record<string, string> = {
  AWAITING_PAYMENT: 'Waiting for payment',
  PLACED: 'Placed',
  CONFIRMED: 'Confirmed',
  PACKED: 'Packed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  DELIVERY_FAILED: 'Delivery failed',
};

export const PAYMENT_LABEL: Record<string, string> = {
  COD: 'Cash on delivery',
  BKASH: 'bKash',
  NAGAD: 'Nagad',
  CARD: 'Card',
};

export const PAYMENT_STATUS_LABEL: Record<string, string> = {
  UNPAID: 'Unpaid',
  PENDING: 'Pending',
  PAID: 'Paid',
  FAILED: 'Failed',
  REFUND_PENDING: 'Refund due',
  REFUNDED: 'Refunded',
};

export const RETURN_STATUS_LABEL: Record<string, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  RECEIVED: 'Item received',
  REFUNDED: 'Refunded',
};

export function voucherValue(v: { type: string; value: number; maxDiscount?: number | null }): string {
  if (v.type === 'PERCENT') return `${v.value}% off`;
  if (v.type === 'FIXED') return `${tk(v.value)} off`;
  return 'Free delivery';
}
