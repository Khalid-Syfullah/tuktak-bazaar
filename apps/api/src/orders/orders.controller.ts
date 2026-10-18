import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, UnauthorizedException } from '@nestjs/common';
import { OrderStatus, Permission, Prisma } from '@prisma/client';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser, effectivePermissions, Public } from '../common/auth';
import { ZONE_LABELS } from '../common/locations';
import { SettingsService } from '../common/settings.service';
import { clamp, toInt } from '../common/utils';
import { PrismaService } from '../prisma/prisma.service';
import { invoiceUrl, maskPhone, verifyInvoiceKey } from './invoice-link';
import { CUSTOMER_CANCELLABLE, OrderWorkflowService } from './order-workflow.service';

class CancelDto {
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
}

const TABS: Record<string, Prisma.OrderWhereInput> = {
  all: {},
  'to-pay': { status: 'AWAITING_PAYMENT' },
  'to-ship': { status: { in: ['PLACED', 'CONFIRMED', 'PACKED'] } },
  'to-receive': { status: 'SHIPPED' },
  'to-review': { status: 'DELIVERED', items: { some: { reviewed: false } } },
  returns: { OR: [{ status: { in: ['CANCELLED', 'DELIVERY_FAILED'] } }, { returns: { some: {} } }] },
};

@Controller('orders')
export class OrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: OrderWorkflowService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Query('tab') tab = 'all', @Query('page') pageQ?: string) {
    const filter = TABS[tab] ?? TABS.all;
    const page = clamp(toInt(pageQ, 1), 1, 200);
    const where = { userId: user.id, ...filter };
    const [orders, total, counts] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 10,
        take: 10,
        include: { items: true },
      }),
      this.prisma.order.count({ where }),
      Promise.all(
        Object.entries(TABS)
          .filter(([key]) => key !== 'all')
          .map(async ([key, f]) => [key, await this.prisma.order.count({ where: { userId: user.id, ...f } })] as const),
      ),
    ]);
    return {
      orders: orders.map((o) => ({
        orderNo: o.orderNo,
        status: o.status,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        total: o.total,
        createdAt: o.createdAt,
        expiresAt: o.expiresAt,
        items: o.items.map((i) => ({
          id: i.id,
          title: i.title,
          variantLabel: i.variantLabel,
          imageUrl: i.imageUrl,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          reviewed: i.reviewed,
        })),
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / 10)),
      counts: Object.fromEntries(counts),
    };
  }

  /**
   * The printable invoice. Opens for the customer who placed the order, for owners and staff with
   * order access, and for anyone holding the order's share link (?key=), who sees the phone masked.
   * Everyone else gets the same 404 as for an order that doesn't exist, so order numbers can't be probed.
   */
  @Public()
  @Get(':orderNo/invoice')
  async invoice(@CurrentUser() user: AuthUser | undefined, @Param('orderNo') orderNo: string, @Query('key') key?: unknown) {
    const viaKey = key !== undefined && verifyInvoiceKey(orderNo, key);
    if (!user && key === undefined) throw new UnauthorizedException('Please log in to see this invoice');
    const order = await this.prisma.order.findUnique({ where: { orderNo }, include: { items: true } });
    const viewer = !order
      ? null
      : user && order.userId === user.id
        ? 'owner'
        : user && effectivePermissions(user).includes(Permission.ORDERS)
          ? 'staff'
          : viaKey
            ? 'link'
            : null;
    if (!order || !viewer) throw new NotFoundException('Invoice not found');
    return {
      viewer,
      orderNo: order.orderNo,
      placedAt: order.placedAt,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      subtotal: order.subtotal,
      shippingFee: order.shippingFee,
      shippingDiscount: order.shippingDiscount,
      discount: order.discount,
      coinsUsed: order.coinsUsed,
      total: order.total,
      voucherCode: order.voucherCode,
      shipName: order.shipName,
      shipPhone: viewer === 'link' ? maskPhone(order.shipPhone) : order.shipPhone,
      shipLine: order.shipLine,
      shipArea: order.shipArea,
      shipDistrict: order.shipDistrict,
      shipDivision: order.shipDivision,
      items: order.items.map((i) => ({
        id: i.id,
        title: i.title,
        variantLabel: i.variantLabel,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        lineTotal: i.lineTotal,
      })),
    };
  }

  @Get(':orderNo')
  async detail(@CurrentUser() user: AuthUser, @Param('orderNo') orderNo: string) {
    const order = await this.prisma.order.findFirst({
      where: { orderNo, userId: user.id },
      include: {
        items: { include: { returns: true, review: true, variant: { select: { product: { select: { slug: true, returnDays: true } } } } } },
        // Staff notes and other internal entries stay in the admin panel
        events: {
          where: { internal: false },
          orderBy: { createdAt: 'asc' },
          select: { id: true, status: true, title: true, note: true, actor: true, createdAt: true },
        },
        payments: { orderBy: { createdAt: 'desc' } },
        shipments: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            courier: true,
            trackingCode: true,
            state: true,
            events: { orderBy: { createdAt: 'desc' }, take: 10, select: { status: true, message: true, source: true, createdAt: true } },
          },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const now = Date.now();
    return {
      ...order,
      // Customers see the courier's own words; notes from staff (bookings, test moves) stay internal.
      shipments: order.shipments.map((sh) => ({
        ...sh,
        events: sh.events.map(({ source, ...e }) => ({ ...e, message: source === 'webhook' || source === 'sync' ? e.message : null })),
      })),
      zoneLabel: ZONE_LABELS[order.zone],
      invoiceUrl: invoiceUrl(order.orderNo),
      canCancel: CUSTOMER_CANCELLABLE.includes(order.status),
      canPay: order.status === 'AWAITING_PAYMENT' && (!order.expiresAt || order.expiresAt.getTime() > now),
      items: order.items.map((item) => {
        const days = item.variant.product.returnDays;
        const returnUntil = order.deliveredAt && days > 0 ? new Date(order.deliveredAt.getTime() + days * 86400000) : null;
        const returnedQty = item.returns.filter((r) => r.status !== 'REJECTED').reduce((s, r) => s + r.quantity, 0);
        return {
          id: item.id,
          productSlug: item.variant.product.slug,
          title: item.title,
          variantLabel: item.variantLabel,
          imageUrl: item.imageUrl,
          unitPrice: item.unitPrice,
          originalPrice: item.originalPrice,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
          reviewed: item.reviewed,
          review: item.review ? { rating: item.review.rating, comment: item.review.comment } : null,
          returns: item.returns.map((r) => ({ id: r.id, status: r.status, quantity: r.quantity, reason: r.reason, createdAt: r.createdAt })),
          returnUntil,
          canReturn: order.status === 'DELIVERED' && !!returnUntil && returnUntil.getTime() > now && returnedQty < item.quantity,
          returnableQty: item.quantity - returnedQty,
        };
      }),
    };
  }

  @HttpCode(200)
  @Post(':orderNo/cancel')
  async cancel(@CurrentUser() user: AuthUser, @Param('orderNo') orderNo: string, @Body() dto: CancelDto) {
    const order = await this.prisma.order.findFirst({ where: { orderNo, userId: user.id } });
    if (!order) throw new NotFoundException('Order not found');
    if (!CUSTOMER_CANCELLABLE.includes(order.status)) {
      throw new BadRequestException('This order is already packed. Contact support or request a return after delivery.');
    }
    await this.workflow.transition(order.id, OrderStatus.CANCELLED, {
      actor: 'customer',
      actorId: user.id,
      reason: dto.reason?.trim() || 'Cancelled by customer',
    });
    return { ok: true };
  }
}
