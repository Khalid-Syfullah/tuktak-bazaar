/** Shapes returned by the admin API (see apps/api/src/admin/*.controller.ts). */

export interface AdminOrder {
  id: string;
  orderNo: string;
  userId: string;
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
  zone: string;
  zoneLabel: string;
  /** The invoice's share link, for sending to the customer. */
  invoiceUrl: string;
  note: string | null;
  riskScore: number;
  needsCall: boolean;
  courier: string | null;
  trackingNo: string | null;
  expiresAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  items: {
    id: string;
    title: string;
    variantLabel: string | null;
    imageUrl: string | null;
    unitPrice: number;
    originalPrice: number;
    quantity: number;
    lineTotal: number;
    flashSaleItemId: string | null;
    returns: { id: string; status: string; quantity: number }[];
    variant: { sku: string; stock: number; product: { slug: string } };
  }[];
  /** Oldest first. `internal` entries (staff notes, courier problems) are never shown to the customer. */
  events: { id: string; status: string | null; title: string; note: string | null; actor: string; actorName: string | null; internal: boolean; createdAt: string }[];
  payments: { id: string; method: string; provider: string; amount: number; status: string; providerTxnId: string | null; createdAt: string }[];
  returns: { id: string; status: string; quantity: number; reason: string; orderItemId: string; createdAt: string }[];
  user: { id: string; name: string; phone: string; email: string | null; codBlocked: boolean; createdAt: string };
  /** Courier consignments booked through the API, newest first. */
  shipments: AdminShipment[];
  /** Support tickets the customer opened about this order, newest first. */
  tickets: { id: string; ticketNo: string; subject: string; status: TicketStatus; createdAt: string }[];
  nextStatuses: string[];
  /** Courier names for shipping without a booking. */
  couriers: string[];
  customerHistory: Record<string, number>;
}

export type TicketStatus = 'OPEN' | 'PENDING' | 'RESOLVED';

export type CourierCode = 'steadfast' | 'pathao' | 'redx' | 'test';

export type ShipmentState = 'BOOKED' | 'IN_TRANSIT' | 'DELIVERED' | 'PARTIAL' | 'RETURNED' | 'CANCELLED';

export interface AdminShipment {
  id: string;
  courier: CourierCode;
  consignmentId: string;
  trackingCode: string;
  state: ShipmentState;
  /** The courier's own status word, as last reported. */
  courierStatus: string | null;
  codAmount: number;
  deliveryFee: number | null;
  note: string | null;
  lastEventAt: string | null;
  lastSyncAt: string | null;
  createdAt: string;
  /** Newest first. */
  events: { id: string; status: string; message: string | null; source: 'booking' | 'webhook' | 'sync' | 'staff'; createdAt: string }[];
}

/** GET /admin/couriers */
export interface CourierOption {
  code: CourierCode;
  name: string;
  configured: boolean;
  missing: string[];
  /** Which destination picker the booking needs. */
  locationKind: 'pathao' | 'redx' | null;
  test: boolean;
  testStatuses?: { status: string; label: string }[];
  webhookUrl: string;
}

export interface CourierLocation {
  id: number;
  name: string;
}
