# Tuktak Bazaar — single-vendor e-commerce for Bangladesh

A complete online store with shopping features, built for one seller:
flash sales, collectible vouchers, coins, photo reviews, product Q&A, returns,
cash on delivery with refusal-risk scoring, bKash / Nagad / card payments through
SSLCommerz, Bangla and Banglish search, and an admin panel that runs it all.

Phase 2 adds staff accounts with per-area permissions and an audit log, courier booking
with Steadfast, Pathao and RedX, sales reports with CSV export, Excel catalog import and
bulk price and stock edits, price-drop and back-in-stock alerts, abandoned-cart reminders
by SMS, and customer support tickets.

**Promo campaigns** run festival-style deal banners on the home page, right before "Shop by
category": a themed Bangla banner with a countdown, price-slash deal cards, a once-a-day mystery
box or spin wheel, and an offer strip under the header. Staff schedule them in
**Admin → Marketing → Campaigns**.

The store is called **Tuktak Bazaar** (টুকটাক বাজার) and will live at tuktakbazaar.com. The name customers see
comes from **Admin → Settings → Store name**; the Bangla wordmark is in `apps/web/components/store/logo.tsx`.

## Stack

| Part | Tech |
| --- | --- |
| API | NestJS 11, Prisma 6, PostgreSQL 16 (with `pg_trgm` for fuzzy search) |
| Web | Next.js 16 (App Router), React 19, Tailwind CSS 4 |
| Jobs | `@nestjs/schedule` inside the API (unpaid orders, payments, alerts, cart reminders, courier status) |
| Tests | `apps/api/test/e2e.ts` — 159 checks over checkout, payments, stock races, returns, staff permissions, couriers, reports, imports, alerts, support and promo campaigns |

```
tuktak-bazaar/
├─ apps/api        NestJS API  (port 4000, everything under /api)
│  ├─ prisma/      schema, migration, seed data and generated demo images
│  ├─ src/         feature folders: auth, catalog, cart, checkout, orders, payments, aftersale, admin …
│  └─ test/e2e.ts  end-to-end checks against a running API
├─ apps/web        Next.js storefront + /admin panel (port 3000)
│  ├─ app/(store)  shopper pages
│  ├─ app/admin    staff pages
│  └─ components/  ui kit, store and admin components
└─ docker-compose.yml
```

## Run it locally

Requirements: Node 20.9+ (22 recommended) and Docker (for Postgres), or your own Postgres 16.

```bash
npm install
npm run db:up                          # Postgres in Docker on :5432
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm run setup                          # apply migrations + load demo data
npm run dev                            # API on :4000, web on :3000
```

Open http://localhost:3000.

| Who | Login | Password |
| --- | --- | --- |
| Customer (has orders, coins, vouchers, support requests) | `01711111111` | `customer123` |
| Owner (open `/admin`) | `admin@tuktakbazaar.local` or `01700000000` | `admin1234` |
| Staff: orders and support | `01700000001` | `staff1234` |
| Staff: catalog and marketing | `01700000002` | `staff1234` |

SMS login codes are printed in the API log and shown on screen while `SMS_PROVIDER=console`.
Every text message the store sends (or would send) is listed under **Admin → Audit log → Text messages**.
Online payments go to a built-in test page while `PAYMENT_PROVIDER=mock`.
Outside production a **Test courier** books pretend consignments, so you can try the whole
delivery flow without courier accounts.

`npm run db:seed` wipes and reloads the demo store at any time.

## Checks

```bash
npm run typecheck
npm run test:e2e        # needs the API running on :4000 and seeded data
```

GitHub Actions (`.github/workflows/ci.yml`) runs migrations, seed, type-checks,
the end-to-end checks and both production builds on every push.

## Going live

1. **Payments** — create an SSLCommerz store (sandbox first) and set in `apps/api/.env`:
   `PAYMENT_PROVIDER=sslcommerz`, `SSLCZ_STORE_ID`, `SSLCZ_STORE_PASSWORD`, `SSLCZ_SANDBOX=true`.
   `API_PUBLIC_URL` must be reachable from the internet so SSLCommerz can post IPN callbacks.
   The client in `apps/api/src/payments/sslcommerz.client.ts` follows the v4 hosted-page API
   but has not been run against a live sandbox yet — do a test payment before launch.
2. **SMS** — set `SMS_PROVIDER=sslwireless`, `SSL_SMS_API_TOKEN` and `SSL_SMS_SID` (SSL Wireless
   SMS Plus). Other providers plug into `apps/api/src/common/sms.service.ts`.
3. **Couriers** — add the credentials for the couriers you use (see `apps/api/.env.example`),
   then paste each webhook URL from **Admin → Settings → Integrations** into that courier's
   merchant panel. Booking happens from the order page once an order is packed; a job polls
   open consignments every 30 minutes in case a webhook is missed. The adapters follow the
   couriers' published APIs but have not yet been run against live accounts: book one test
   parcel with each before relying on it.
4. **Secrets** — set a long random `JWT_SECRET` and `COOKIE_SECURE=true` behind HTTPS.
5. **Images** — uploads go to `UPLOAD_DIR` on disk; mount a volume or switch the storage
   engine in `apps/api/src/uploads/uploads.controller.ts` to S3.
6. **Jobs** — scheduled jobs run inside the API; if you run several API instances, set
   `DISABLE_JOBS=true` on all but one.
7. **Compliance** — trade licence, DBID registration, and the current Digital Commerce
   Operation Guidelines (delivery and refund timelines). Return windows, fees and COD
   rules are all in Admin → Settings.

### Docker

```bash
docker compose --profile app up -d --build
docker compose exec api npm run db:seed
```

### A single server (EC2 + nginx), with deploys from GitHub

This repo deploys itself to one EC2 instance on every push to `main`: CI first, then a
release-folder deploy over AWS Systems Manager with a health check and automatic rollback.
How it works, the server layout and how to roll back are in [`deploy/README.md`](deploy/README.md).

## How the important parts work

- **Stock never oversells.** Checkout takes stock with one conditional
  `UPDATE … WHERE stock >= qty` per line inside the order transaction, plus a database
  check constraint. Flash-sale caps and voucher limits use the same pattern.
- **Orders follow one state machine** (`apps/api/src/orders/order-workflow.service.ts`).
  Every transition is validated, logged as a timeline event and sent to the customer.
  Cancelling or a failed delivery returns stock, flash-sale quota, voucher use and coins.
- **COD risk score** (0–100) from the phone number's history decides whether an order
  confirms itself, waits for a call, or needs online payment. Thresholds are in settings.
- **Payments are idempotent.** An order is marked paid only once even if the gateway
  callback, the IPN and the reconciliation job all arrive.
- **Search** expands each word through a synonym table (Bangla ⇄ Banglish ⇄ English),
  matches Latin words at word starts, and uses trigram similarity for typos.
- **Staff permissions** are checked on every admin API call (`@Perm(...)` in
  `apps/api/src/common/auth.ts`), re-read from the database each time, so taking access away
  works at once. Owners hold every permission and manage staff.
- **Audit log.** A global interceptor (`apps/api/src/common/audit.ts`) writes one row for each
  successful change a staff member makes, with a readable summary and the request body
  (passwords and tokens hidden).
- **Couriers** share one adapter interface (`apps/api/src/couriers/`). Webhooks are checked
  with each courier's own secret, deduplicated, and can only move a parcel forwards; a
  delivery confirms the order and a return marks it as a failed delivery, which restocks it.
- **Excel import** previews every change first and applies all of it or none of it in one
  transaction. Stock changes land in the inventory movement log.
- **Alerts** compare against the price the customer saw (flash prices included) and claim
  each alert before sending, so nobody is notified twice.
- **Promo campaigns** (`apps/api/src/campaigns/`, `apps/web/components/store/campaign/`).
  The highest-priority active campaign whose teaser or live window covers now is shown.
  Countdowns run on the server's clock (phones are often minutes off), and the block turns
  from teaser to live and disappears at the end without a reload. The daily game is decided
  on the server: one play per customer per Dhaka day (a unique key), the reward is picked by
  weight among rewards with stock left and claimed with a conditional update, so 20 plays at
  once can't hand out more than the stock. Flash prices on deal cards only count while that
  flash sale runs. All shopper-facing campaign text is Bangla. Animations use transform and
  opacity only (about 11 KB of gzipped JavaScript in total) and switch off for reduced motion.
