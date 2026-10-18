import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AccountController } from './account/account.controller';
import { AdminBulkController } from './admin/admin-bulk.controller';
import { AdminCatalogController } from './admin/admin-catalog.controller';
import { AdminMarketingController } from './admin/admin-marketing.controller';
import { AdminOrdersController } from './admin/admin-orders.controller';
import { AdminOverviewController } from './admin/admin-overview.controller';
import { AdminReportsController } from './admin/admin-reports.controller';
import { AdminStaffController } from './admin/admin-staff.controller';
import { AftersaleController } from './aftersale/aftersale.controller';
import { AlertsController } from './alerts/alerts.controller';
import { AlertsService } from './alerts/alerts.service';
import { ReviewsService } from './aftersale/reviews.service';
import { AuthController } from './auth/auth.controller';
import { AdminCampaignsController } from './campaigns/admin-campaigns.controller';
import { CampaignsController } from './campaigns/campaigns.controller';
import { CampaignsService } from './campaigns/campaigns.service';
import { CartController } from './cart/cart.controller';
import { CartService } from './cart/cart.service';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { SearchService } from './catalog/search.service';
import { CheckoutController } from './checkout/checkout.controller';
import { CheckoutService } from './checkout/checkout.service';
import { AuditInterceptor } from './common/audit';
import { AuthGuard } from './common/auth';
import { EngagementService } from './common/engagement.service';
import { PricingService } from './common/pricing.service';
import { SettingsService } from './common/settings.service';
import { SmsService } from './common/sms.service';
import { AdminCouriersController, CourierWebhooksController } from './couriers/couriers.controller';
import { CouriersService } from './couriers/couriers.service';
import { EngagementController } from './engagement/engagement.controller';
import { HealthController } from './health.controller';
import { AdminSystemController } from './jobs/jobs.controller';
import { JobsService } from './jobs/jobs.service';
import { OrderWorkflowService } from './orders/order-workflow.service';
import { OrdersController } from './orders/orders.controller';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { PrismaService } from './prisma/prisma.service';
import { AdminSupportController, SupportController } from './support/support.controller';
import { SupportService } from './support/support.service';
import { UploadsController } from './uploads/uploads.controller';

/** Shared services every feature uses. */
@Global()
@Module({
  providers: [PrismaService, SettingsService, PricingService, EngagementService, OrderWorkflowService, ReviewsService, SmsService, AlertsService, CouriersService],
  exports: [PrismaService, SettingsService, PricingService, EngagementService, OrderWorkflowService, ReviewsService, SmsService, AlertsService, CouriersService],
})
class CoreModule {}

@Module({ controllers: [AuthController, AccountController] })
class IdentityModule {}

@Module({ controllers: [CatalogController], providers: [CatalogService, SearchService], exports: [CatalogService] })
class CatalogModule {}

@Module({
  controllers: [CartController, CheckoutController, OrdersController, PaymentsController],
  providers: [CartService, CheckoutService, PaymentsService],
  exports: [PaymentsService],
})
class ShoppingModule {}

@Module({
  controllers: [AftersaleController, EngagementController, UploadsController, AlertsController, SupportController, CourierWebhooksController],
  providers: [SupportService],
  exports: [SupportService],
})
class CustomerCareModule {}

@Module({
  imports: [CatalogModule, CustomerCareModule],
  controllers: [
    AdminCatalogController,
    AdminOrdersController,
    AdminMarketingController,
    AdminOverviewController,
    AdminStaffController,
    AdminReportsController,
    AdminBulkController,
    AdminCouriersController,
    AdminSupportController,
  ],
})
class AdminModule {}

@Module({ imports: [ShoppingModule], controllers: [AdminSystemController], providers: [JobsService] })
class JobsModule {}

/** Promo campaigns: the home-page banner, offer strip, deals and daily game, and their admin screens. */
@Module({ controllers: [CampaignsController, AdminCampaignsController], providers: [CampaignsService] })
class CampaignsModule {}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'dev-only-secret',
      signOptions: { expiresIn: `${Number(process.env.JWT_EXPIRES_DAYS || 7)}d` },
    }),
    ScheduleModule.forRoot(),
    CoreModule,
    IdentityModule,
    CatalogModule,
    ShoppingModule,
    CustomerCareModule,
    AdminModule,
    JobsModule,
    CampaignsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
