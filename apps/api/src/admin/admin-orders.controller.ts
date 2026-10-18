import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { CoinReason, MovementReason, OrderStatus, PaymentMethod, PaymentStatus, Permission, Prisma, RefundMethod, ReturnStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Audit } from '../common/audit';
import { AuthUser, CurrentUser, Perm } from '../common/auth';
import { EngagementService } from '../common/engagement.service';
import { ZONE_LABELS } from '../common/locations';
import { clamp, toBool, toInt } from '../common/utils';
import { OrderWorkflowService, STATUS_TITLES, TRANSITIONS } from '../orders/order-workflow.service';
import { invoiceUrl } from '../orders/invoice-link';
import { PrismaService } from '../prisma/prisma.service';

class TransitionDto {
  @IsEnum(OrderStatus) to: OrderStatus;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
  @IsOptional() @IsString() @MaxLength(200) reason?: string;
  @IsOptional() @IsString() @MaxLength(60) courier?: string;
  @IsOptional() @IsString() @MaxLength(60) trackingNo?: string;
}

class NoteDto {
  @IsString() @MaxLength(500) note: string;
}

class ReturnDecisionDto {
  @IsIn(['approve', 'reject', 'receive', 'refund']) action: 'approve' | 'reject' | 'receive' | 'refund';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsInt() @Min(0) refundAmount?: number;
  @IsOptional() @IsEnum(RefundMethod) refundMethod?: RefundMethod;
  @IsOptional() @IsBoolean() restock?: boolean;
}

class RefundDto {
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

export const COURIERS = ['Steadfast', 'Pathao Courier', 'RedX', 'Paperfly', 'eCourier', 'Sundarban Courier', 'Own rider'];

@Perm(Permission.ORDERS)
@Controller('admin')
export class AdminOrdersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: OrderWorkflowService,
    private readonly engagement: EngagementService,
  ) {}

  @Get('orders')
  async orders(@Query() query: Record<string, string>) {
    const page = clamp(toInt(query.page, 1), 1, 1000);
    const limit = clamp(toInt(query.limit, 20), 1, 100);
    const where: Prisma.OrderWhereInput = {};
    if (query.status && query.status in OrderStatus) where.status = query.status as OrderStatus;
    if (query.payment && query.payment in PaymentMethod) where.paymentMethod = query.payment as PaymentMethod;
    if (query.paymentStatus && query.paymentStatus in PaymentStatus) where.paymentStatus = query.paymentStatus as PaymentStatus;
    if (toBool(query.needsCall)) where.needsCall = true;
    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { orderNo: { contains: q, mode: 'insensitive' } },
        { shipPhone: { contains: q } },
        { shipName: { contains: q, mode: 'insensitive' } },
        { trackingNo: { contains: q, mode: 'insensitive' } },
      ];
    }
    const [rows, total, statusCounts] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { items: true } } },
      }),
      this.prisma.order.count({ where }),
      this.prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      items: rows.map(({ _count, ...o }) => ({
        id: o.id,
        orderNo: o.orderNo,
        status: o.status,
        paymentMethod: o.paymentMethod,
        paymentStatus: o.paymentStatus,
        total: o.total,
        itemCount: _count.items,
        customer: o.shipName,
        phone: o.shipPhone,
        district: o.shipDistrict,
        riskScore: o.riskScore,
        needsCall: o.needsCall,
        createdAt: o.createdAt,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      statusCounts: Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all])),
      couriers: COURIERS,
    };
  }

  @Get('orders/:id')
  async order(@Param('id') id: string) {
    const order = await this.prisma.order.findFirst({
      where: { OR: [{ id }, { orderNo: id }] },
      include: {
        items: { include: { returns: true, variant: { select: { sku: true, stock: true, product: { select: { slug: true } } } } } },
        events: { orderBy: { createdAt: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' } },
        returns: { orderBy: { createdAt: 'desc' } },
        user: { select: { id: true, name: true, phone: true, email: true, codBlocked: true, createdAt: true } },
        shipments: { orderBy: { createdAt: 'desc' }, include: { events: { orderBy: { createdAt: 'desc' }, take: 30 } } },
        tickets: { orderBy: { createdAt: 'desc' }, select: { id: true, ticketNo: true, subject: true, status: true, createdAt: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    const history = await this.prisma.order.groupBy({
      by: ['status'],
      where: { OR: [{ userId: order.userId }, { shipPhone: order.shipPhone }], NOT: { id: order.id } },
      _count: { _all: true },
    });
    return {
      ...order,
      zoneLabel: ZONE_LABELS[order.zone],
      invoiceUrl: invoiceUrl(order.orderNo),
      nextStatuses: TRANSITIONS[order.status],
      couriers: COURIERS,
      customerHistory: Object.fromEntries(history.map((h) => [h.status, h._count._all])),
    };
  }

  @HttpCode(200)
  @Audit({
    action: 'order.status',
    entity: 'order',
    summary: ({ body, result }) =>
      `Order ${result?.orderNo ?? ''}: ${STATUS_TITLES[body.to as OrderStatus] ?? body.to}${body.reason ? ` (${body.reason})` : ''}${body.trackingNo ? ` · ${body.courier} ${body.trackingNo}` : ''}`,
  })
  @Post('orders/:id/transition')
  async transition(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: TransitionDto) {
    await this.workflow.transition(id, dto.to, {
      actor: 'admin',
      actorId: user.id,
      actorName: user.name,
      note: dto.note,
      reason: dto.reason,
      courier: dto.courier,
      trackingNo: dto.trackingNo,
    });
    return this.order(id);
  }

  @HttpCode(200)
  @Audit({ action: 'order.note', entity: 'order', summary: ({ result }) => `Note on order ${result?.orderNo ?? ''}` })
  @Post('orders/:id/note')
  async note(@Param('id') id: string, @Body() dto: NoteDto, @CurrentUser() user: AuthUser) {
    await this.prisma.orderEvent.create({
      data: { orderId: id, title: 'Staff note', note: dto.note, actor: 'admin', actorId: user.id, actorName: user.name, internal: true },
    });
    return this.order(id);
  }

  /** Records that a refund owed on a cancelled or failed prepaid order was paid out. */
  @HttpCode(200)
  @Audit({ action: 'order.refund', entity: 'order', summary: ({ result }) => `Refund recorded for order ${result?.orderNo ?? ''}` })
  @Post('orders/:id/refunded')
  async markRefunded(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RefundDto) {
    const order = await this.prisma.order.findUnique({ where: { id } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.paymentStatus !== PaymentStatus.REFUND_PENDING) throw new BadRequestException('No refund is pending on this order');
    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id }, data: { paymentStatus: PaymentStatus.REFUNDED } }),
      this.prisma.orderEvent.create({ data: { orderId: id, title: 'Refund sent', note: dto.note, actor: 'admin', actorId: user.id, actorName: user.name } }),
      this.prisma.notification.create({
        data: {
          userId: order.userId,
          type: 'order',
          title: 'Refund sent',
          body: `We refunded ৳${order.total} for order ${order.orderNo}.`,
          link: `/account/orders/${order.orderNo}`,
        },
      }),
    ]);
    return this.order(id);
  }

  // ───── Returns ─────

  @Get('returns')
  async returns(@Query() query: Record<string, string>) {
    const page = clamp(toInt(query.page, 1), 1, 1000);
    const where: Prisma.ReturnRequestWhereInput = {};
    if (query.status && query.status in ReturnStatus) where.status = query.status as ReturnStatus;
    const [rows, total, counts] = await Promise.all([
      this.prisma.returnRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * 20,
        take: 20,
        include: {
          orderItem: true,
          order: { select: { id: true, orderNo: true, paymentMethod: true } },
          user: { select: { name: true, phone: true } },
        },
      }),
      this.prisma.returnRequest.count({ where }),
      this.prisma.returnRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      items: rows,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / 20)),
      statusCounts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    };
  }

  @HttpCode(200)
  @Audit({
    action: 'return.decision',
    entity: 'return',
    summary: ({ body, result }) =>
      ({ approve: 'Approved', reject: 'Rejected', receive: 'Received', refund: 'Refunded' } as Record<string, string>)[body.action] +
      ` return of ${result?.quantity ?? ''} item(s)${body.action === 'refund' && result?.refundAmount != null ? ` · ৳${result.refundAmount} as ${String(result.refundMethod).toLowerCase()}` : ''}`,
  })
  @Post('returns/:id/decision')
  async decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ReturnDecisionDto) {
    return this.prisma.$transaction(async (tx) => {
      const ret = await tx.returnRequest.findUnique({ where: { id }, include: { orderItem: true, order: true } });
      if (!ret) throw new NotFoundException('Return not found');
      const allowed: Record<ReturnDecisionDto['action'], ReturnStatus[]> = {
        approve: ['REQUESTED'],
        reject: ['REQUESTED', 'APPROVED'],
        receive: ['APPROVED'],
        refund: ['RECEIVED'],
      };
      if (!allowed[dto.action].includes(ret.status)) {
        throw new BadRequestException(`Can't ${dto.action} a return that is ${ret.status.toLowerCase()}`);
      }
      const now = new Date();
      const item = ret.orderItem;
      let status: ReturnStatus;
      let message: string;
      const data: Prisma.ReturnRequestUpdateInput = { adminNote: dto.note ?? ret.adminNote };

      switch (dto.action) {
        case 'approve':
          status = 'APPROVED';
          message = `Your return for ${item.title} is approved. Hand the item to our courier or drop it at our hub.`;
          break;
        case 'reject':
          status = 'REJECTED';
          data.resolvedAt = now;
          message = `Your return for ${item.title} was not accepted${dto.note ? `: ${dto.note}` : '.'}`;
          break;
        case 'receive': {
          status = 'RECEIVED';
          const restock = dto.restock ?? ret.restock;
          data.restock = restock;
          if (restock) {
            await tx.productVariant.update({ where: { id: item.variantId }, data: { stock: { increment: ret.quantity } } });
            await tx.inventoryMovement.create({
              data: {
                variantId: item.variantId,
                delta: ret.quantity,
                reason: MovementReason.RETURN,
                refId: ret.id,
                note: `Return on ${ret.order.orderNo}`,
                createdById: user.id,
              },
            });
          }
          message = `We received your returned ${item.title}. Your refund is next.`;
          break;
        }
        case 'refund': {
          status = 'REFUNDED';
          const amount = dto.refundAmount ?? ret.refundAmount ?? item.unitPrice * ret.quantity;
          const method = dto.refundMethod ?? ret.refundMethod;
          if (amount > item.unitPrice * ret.quantity) throw new BadRequestException('Refund cannot exceed what was paid for these items');
          Object.assign(data, { refundAmount: amount, refundMethod: method, resolvedAt: now });
          if (method === RefundMethod.COINS) {
            await this.engagement.credit(tx, ret.userId, amount, CoinReason.REFUND, `Return on ${ret.order.orderNo}`, ret.id);
            message = `৳${amount} was added to your coins for the returned ${item.title}.`;
          } else {
            message = `৳${amount} is being refunded to your original payment method for the returned ${item.title}.`;
          }
          break;
        }
      }

      const updated = await tx.returnRequest.update({ where: { id }, data: { ...data, status } });
      await tx.orderEvent.create({
        data: {
          orderId: ret.orderId,
          title: `Return ${status.toLowerCase()}`,
          note: `${ret.quantity} × ${item.title}${dto.note ? ` — ${dto.note}` : ''}`,
          actor: 'admin',
          actorId: user.id,
          actorName: user.name,
        },
      });
      await this.engagement.notify(tx, ret.userId, { type: 'return', title: `Return ${status.toLowerCase()}`, body: message, link: '/account/returns' });
      return updated;
    });
  }
}
