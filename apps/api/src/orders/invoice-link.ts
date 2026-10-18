import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Share links for invoices: /invoice/<orderNo>?key=<key>. The key is an HMAC of the order number,
 * so nothing is stored and a key only ever opens its own order. Changing the secret
 * (INVOICE_LINK_SECRET, or JWT_SECRET when that is not set) invalidates every link already shared.
 */
const KEY_LENGTH = 22; // 22 base64url characters, about 128 bits

function secret(): string {
  return process.env.INVOICE_LINK_SECRET || process.env.JWT_SECRET || 'dev-only-secret';
}

export function invoiceKey(orderNo: string): string {
  return createHmac('sha256', secret()).update(`invoice:v1:${orderNo}`).digest('base64url').slice(0, KEY_LENGTH);
}

export function verifyInvoiceKey(orderNo: string, key: unknown): boolean {
  if (typeof key !== 'string' || key.length !== KEY_LENGTH) return false;
  const expected = Buffer.from(invoiceKey(orderNo));
  const given = Buffer.from(key);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The link a customer or staff member can send to anyone who needs to see the invoice. */
export function invoiceUrl(orderNo: string): string {
  const web = (process.env.WEB_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${web}/invoice/${encodeURIComponent(orderNo)}?key=${invoiceKey(orderNo)}`;
}

/** 01712345678 -> 017•••••678, for invoices opened through a share link. */
export function maskPhone(phone: string): string {
  if (phone.length < 7) return '•'.repeat(phone.length);
  return `${phone.slice(0, 3)}${'•'.repeat(phone.length - 6)}${phone.slice(-3)}`;
}
