/* eslint-disable no-console */
/**
 * Demo data: catalog, images, campaigns, customers with order history and reviews.
 * Run with `npm run db:seed` (wipes and refills every table).
 */
import { BannerPlacement, CoinReason, MovementReason, Prisma, PrismaClient, VoucherType } from '@prisma/client';
import { hash } from 'bcryptjs';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { BRANDS, CATEGORIES, PRODUCTS, ProductSeed, SYNONYMS } from './catalog-data';
import { bannerSvg, categorySvg, illustration, productSvg, stripSvg } from './seed-art';

const prisma = new PrismaClient();
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || join(__dirname, '..', 'uploads'));
const SEED_DIR = join(UPLOAD_DIR, 'seed');

// Deterministic randomness so every seed produces the same store.
let rngState = 20261016;
function rand() {
  rngState |= 0;
  rngState = (rngState + 0x6d2b79f5) | 0;
  let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];

function slugify(s: string) {
  return s.toLowerCase().replace(/["']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function writeAsset(rel: string, svg: string) {
  const file = join(SEED_DIR, rel);
  mkdirSync(join(file, '..'), { recursive: true });
  writeFileSync(file, svg);
  return `/uploads/seed/${rel}`;
}

const days = (n: number) => new Date(Date.now() - n * 86400000);
const hours = (n: number) => new Date(Date.now() + n * 3600000);

const CUSTOMERS = [
  { name: 'Rahim Uddin', phone: '01712000001', division: 'Dhaka', district: 'Dhaka', area: 'Mirpur', line: 'House 12, Road 3, Section 10' },
  { name: 'Nusrat Jahan', phone: '01812000002', division: 'Chattogram', district: 'Chattogram', area: 'Agrabad', line: 'Flat 4B, CDA Residential Area' },
  { name: 'Tanvir Ahmed', phone: '01912000003', division: 'Sylhet', district: 'Sylhet', area: 'Zindabazar', line: 'Shahjalal Uposhohor, Block C' },
  { name: 'Farhana Akter', phone: '01612000004', division: 'Dhaka', district: 'Gazipur', area: 'Tongi', line: 'Station Road, Cherag Ali' },
  { name: 'Sabbir Hossain', phone: '01512000005', division: 'Rajshahi', district: 'Rajshahi', area: 'Shaheb Bazar', line: 'Holding 45, Ghoramara' },
  { name: 'Mitu Rahman', phone: '01312000006', division: 'Khulna', district: 'Khulna', area: 'Sonadanga', line: 'Road 7, Nirala R/A' },
  { name: 'Arif Chowdhury', phone: '01712000007', division: 'Dhaka', district: 'Dhaka', area: 'Uttara', line: 'Sector 7, Road 18, House 9' },
  { name: 'Sumaiya Islam', phone: '01812000008', division: 'Rangpur', district: 'Rangpur', area: 'Jahaj Company More', line: 'Station Road, Holding 22' },
  { name: 'Imran Kabir', phone: '01912000009', division: 'Barishal', district: 'Barishal', area: 'Nathullabad', line: 'Band Road, House 3' },
  { name: 'Shirin Sultana', phone: '01612000010', division: 'Mymensingh', district: 'Mymensingh', area: 'Ganginarpar', line: 'Choto Bazar, Lane 2' },
];

const REVIEW_TEXT: Record<'tech' | 'fashion' | 'home' | 'beauty' | 'sports', [number, string][]> = {
  tech: [
    [5, 'Original product, sealed box. Delivered in Dhaka the next day. Very happy.'],
    [5, 'Battery backup is excellent, easily a full day. Recommended!'],
    [4, 'Good value for money. Build quality is solid, the charger could be faster.'],
    [5, 'Valo product. Sound and display both great for this price.'],
    [4, 'Took 4 days to reach Sylhet but packaging was very safe.'],
    [3, 'Works fine but the box was a bit damaged on arrival.'],
    [5, 'Second time buying from Tuktak Bazaar. Genuine warranty card included.'],
  ],
  fashion: [
    [5, 'Fabric quality is really nice and the stitching is neat. Fits perfectly.'],
    [4, 'Colour is slightly lighter than the picture but still looks good.'],
    [5, 'Bought for Eid, got many compliments. Will order again.'],
    [4, 'Size runs a little large, order one size smaller.'],
    [3, 'Okay for the price. Expected a bit thicker material.'],
    [5, 'Comfortable and exactly as shown. Delivery was quick.'],
  ],
  home: [
    [5, 'Works perfectly during load-shedding. Very useful product.'],
    [4, 'Good build, does the job well. Delivery man was polite.'],
    [5, 'Ammu loves it! Easy to use and clean.'],
    [3, 'Average quality, but works as described.'],
    [5, 'Excellent product, packaging was very secure.'],
  ],
  beauty: [
    [5, 'Original product with batch number. My skin feels much better.'],
    [4, 'Light texture, no white cast. Will repurchase.'],
    [5, 'Long-lasting and smells amazing.'],
    [4, 'Good product, a bit pricey but authentic.'],
  ],
  sports: [
    [5, 'Great quality, my son uses it every day.'],
    [4, 'Good grip and quality for the price.'],
    [5, 'Exactly as described. Fast delivery to Rajshahi.'],
  ],
};

function reviewPool(category: string) {
  if (['mobiles', 'laptops', 'audio', 'smart-watches', 'power-accessories'].includes(category)) return REVIEW_TEXT.tech;
  if (['mens-clothing', 'womens-clothing', 'shoes', 'bags', 'eyewear'].includes(category)) return REVIEW_TEXT.fashion;
  if (['skincare', 'fragrance'].includes(category)) return REVIEW_TEXT.beauty;
  if (['team-sports', 'fitness'].includes(category)) return REVIEW_TEXT.sports;
  return REVIEW_TEXT.home;
}

const QUESTIONS: [string, string, string][] = [
  ['nimbus-x5-5g-smartphone', 'Is this the global version with official warranty?', 'Yes, this is the official Bangladesh version with a 1-year Nimbus warranty and BTRC registration.'],
  ['nimbus-x5-5g-smartphone', 'Does it support Grameenphone 5G?', 'Yes, it supports the 5G bands used by operators in Bangladesh.'],
  ['sonora-wave-anc-wireless-headphones', 'Can I connect it to my laptop and phone at the same time?', 'Yes, multipoint lets it stay connected to two devices at once.'],
  ['volt-20000mah-power-bank-22-5w', 'Can it charge a WiFi router?', 'Yes, with a USB-to-DC cable (sold separately) it can run most 9V/12V routers.'],
  ['bunon-cotton-panjabi', 'What is the chest size for L?', 'L fits a 42-inch chest. The size chart is in the description images.'],
  ['bunon-cotton-panjabi', 'Will the maroon colour fade after washing?', null as unknown as string],
  ['alo-rechargeable-table-fan-12', 'How long does it take to charge fully?', 'About 6–7 hours from empty.'],
  ['ranna-electric-kettle-1-8l', 'Is the inside plastic or steel?', 'The inner body is food-grade stainless steel.'],
  ['glow-lab-sunscreen-spf-50-pa', 'Is it suitable for oily skin?', 'Yes, the gel texture is non-greasy and suits oily and combination skin.'],
];

async function wipe() {
  // Delete children before parents.
  const tables = [
    'CampaignPlay', 'CampaignReward', 'CampaignTickerItem', 'CampaignProduct', 'Campaign',
    'AuditLog', 'SmsLog', 'TicketMessage', 'SupportTicket', 'ProductAlert', 'ShipmentEvent', 'Shipment',
    'Notification', 'CoinTransaction', 'Question', 'Review', 'ReturnRequest', 'Payment', 'OrderEvent', 'OrderItem',
    'VoucherRedemption', 'Order', 'UserVoucher', 'Voucher', 'FlashSaleItem', 'FlashSale', 'Banner', 'CartItem', 'Cart',
    'WishlistItem', 'InventoryMovement', 'ProductVariant', 'ProductImage', 'Product', 'Brand', 'Category', 'Address',
    'OtpCode', 'User', 'Setting', 'SearchSynonym',
  ];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} CASCADE`);
  rmSync(SEED_DIR, { recursive: true, force: true });
}

async function main() {
  console.log('Seeding Tuktak Bazaar demo store…');
  await wipe();

  // ───── Categories ─────
  const categoryIds = new Map<string, string>();
  let order = 0;
  for (const top of CATEGORIES) {
    const parent = await prisma.category.create({
      data: { name: top.name, nameBn: top.nameBn, slug: top.slug, icon: top.icon, sortOrder: order++ },
    });
    categoryIds.set(top.slug, parent.id);
    for (const child of top.children ?? []) {
      const imageUrl = child.art
        ? writeAsset(`categories/${child.slug}.svg`, categorySvg(child.art.kind, child.art.body, child.art.accent, child.art.bg, child.slug.replace(/-/g, '')))
        : null;
      const c = await prisma.category.create({
        data: { name: child.name, nameBn: child.nameBn, slug: child.slug, icon: child.icon, parentId: parent.id, imageUrl, sortOrder: order++ },
      });
      categoryIds.set(child.slug, c.id);
    }
  }

  // ───── Brands ─────
  const brandIds = new Map<string, string>();
  for (const name of BRANDS) {
    const b = await prisma.brand.create({ data: { name, slug: slugify(name) } });
    brandIds.set(name, b.id);
  }

  // ───── Products ─────
  const productIds = new Map<string, string>();
  const variantsBySlug = new Map<string, { id: string; price: number; salePrice: number | null; label: string }[]>();
  for (const [pi, p] of PRODUCTS.entries()) {
    const slug = slugify(p.title);
    const colors = p.colors ?? [{ name: 'Standard', hex: '#888888' }];
    const colorImages = colors.map((c, ci) =>
      writeAsset(`products/${slug}-${ci + 1}.svg`, productSvg(p.kind, c.hex, p.accent, p.bg, `p${pi}c${ci}`)),
    );
    // Single-colour products get a second gallery shot on a tinted background.
    const gallery = [...colorImages];
    if (colors.length === 1) {
      gallery.push(writeAsset(`products/${slug}-alt.svg`, productSvg(p.kind, colors[0].hex, p.accent, '#f1f3f6', `p${pi}alt`)));
    }

    const hasColorOption = !!p.colors && p.colors.length > 1;
    const optionNames = [...(hasColorOption ? ['Color'] : []), ...(p.option && p.option.values.length > 1 ? [p.option.name] : [])];
    const product = await prisma.product.create({
      data: {
        title: p.title,
        slug,
        description: p.description,
        highlights: p.highlights,
        brandId: brandIds.get(p.brand),
        categoryId: categoryIds.get(p.category)!,
        optionNames,
        specs: p.specs.map(([name, value]) => ({ name, value })) as Prisma.InputJsonValue,
        keywords: p.keywords,
        warranty: p.warranty ?? null,
        returnDays: p.returnDays ?? 7,
        weightGrams: p.weightGrams ?? 500,
        isFeatured: !!p.featured,
        createdAt: days(between(5, 120)),
        images: { create: gallery.map((url, i) => ({ url, alt: p.title, sortOrder: i })) },
      },
    });
    productIds.set(slug, product.id);

    const optValues = p.option?.values ?? [null];
    const variants: { id: string; price: number; salePrice: number | null; label: string }[] = [];
    for (const [ci, color] of colors.entries()) {
      for (const ov of optValues) {
        const [price, salePrice] = Array.isArray(p.price) ? p.price : p.price[ov!];
        const options: Record<string, string> = {};
        if (hasColorOption) options.Color = color.name;
        if (p.option && p.option.values.length > 1 && ov) options[p.option.name] = ov;
        const sku = [
          p.brand.replace(/\s/g, '').slice(0, 3).toUpperCase(),
          String(pi + 1).padStart(3, '0'),
          hasColorOption ? color.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() : null,
          ov && p.option && p.option.values.length > 1 ? ov.replace(/[^A-Za-z0-9]/g, '').slice(0, 6).toUpperCase() : null,
        ]
          .filter(Boolean)
          .join('-');
        // A few low and sold-out variants so the admin low-stock views have something to show.
        let stock = between(8, 90);
        if (pi % 11 === 3 && ci === 0) stock = 3;
        if (pi % 13 === 7 && ci === colors.length - 1) stock = 0;
        const v = await prisma.productVariant.create({
          data: {
            productId: product.id,
            sku,
            options,
            price,
            salePrice,
            stock,
            lowStockThreshold: 5,
            imageUrl: colorImages[ci],
          },
        });
        if (stock > 0) {
          await prisma.inventoryMovement.create({ data: { variantId: v.id, delta: stock, reason: MovementReason.RESTOCK, note: 'Opening stock' } });
        }
        variants.push({ id: v.id, price, salePrice, label: Object.values(options).join(', ') });
      }
    }
    variantsBySlug.set(slug, variants);
  }
  console.log(`  ${PRODUCTS.length} products, ${[...variantsBySlug.values()].flat().length} variants`);

  // ───── Search synonyms ─────
  for (const [term, synonyms] of SYNONYMS) await prisma.searchSynonym.create({ data: { term, synonyms } });

  // ───── Users ─────
  const admin = await prisma.user.create({
    data: {
      name: 'Store Admin',
      phone: '01700000000',
      email: 'admin@tuktakbazaar.local',
      passwordHash: await hash('admin1234', 10),
      role: 'ADMIN',
      cart: { create: {} },
    },
  });
  const customerHash = await hash('customer123', 10);
  const reviewers = [];
  for (const c of CUSTOMERS) {
    const u = await prisma.user.create({
      data: {
        name: c.name,
        phone: c.phone,
        passwordHash: customerHash,
        createdAt: days(between(60, 300)),
        cart: { create: {} },
        addresses: {
          create: { fullName: c.name, phone: c.phone, division: c.division, district: c.district, area: c.area, line: c.line, isDefault: true },
        },
      },
      include: { addresses: true },
    });
    reviewers.push(u);
  }

  // ───── Delivered orders with reviews ─────
  let orderSeq = 1000;
  const orderNo = () => `TB${String(250900 + Math.floor(orderSeq / 40)).slice(0, 6)}${String(4000000 + orderSeq++)}`;
  const zoneFor = (district: string) =>
    district === 'Dhaka' ? 'INSIDE_DHAKA' : ['Gazipur', 'Narayanganj', 'Narsingdi', 'Munshiganj', 'Manikganj'].includes(district) ? 'DHAKA_SUBURBS' : 'OUTSIDE_DHAKA';
  const feeFor = (zone: string) => (zone === 'INSIDE_DHAKA' ? 60 : zone === 'DHAKA_SUBURBS' ? 100 : 120);

  for (const [pi, p] of PRODUCTS.entries()) {
    const slug = slugify(p.title);
    const variants = variantsBySlug.get(slug)!;
    const pool = reviewPool(p.category);
    const reviewCount = between(2, 6);
    const shuffled = [...reviewers].sort(() => rand() - 0.5).slice(0, reviewCount);
    let delivered = 0;
    for (const [ri, user] of shuffled.entries()) {
      const v = pick(variants);
      const qty = rand() < 0.85 ? 1 : 2;
      const unit = v.salePrice ?? v.price;
      const addr = user.addresses[0];
      const zone = zoneFor(addr.district);
      const subtotal = unit * qty;
      const fee = feeFor(zone);
      const shippingDiscount = subtotal >= 2000 ? fee : 0;
      const placed = days(between(8, 90));
      const at = (h: number) => new Date(placed.getTime() + h * 3600000);
      const [rating, comment] = pool[(pi + ri * 3) % pool.length];
      const o = await prisma.order.create({
        data: {
          orderNo: orderNo(),
          userId: user.id,
          status: 'DELIVERED',
          paymentMethod: rand() < 0.7 ? 'COD' : pick(['BKASH', 'NAGAD', 'CARD'] as const),
          paymentStatus: 'PAID',
          subtotal,
          shippingFee: fee,
          shippingDiscount,
          total: subtotal + fee - shippingDiscount,
          shipName: user.name,
          shipPhone: user.phone,
          shipDivision: addr.division,
          shipDistrict: addr.district,
          shipArea: addr.area,
          shipLine: addr.line,
          zone,
          courier: pick(['Steadfast', 'Pathao Courier', 'RedX']),
          trackingNo: `TRK${between(10000000, 99999999)}`,
          coinsAwarded: true,
          placedAt: placed,
          createdAt: placed,
          confirmedAt: at(1),
          packedAt: at(20),
          shippedAt: at(30),
          deliveredAt: at(zone === 'INSIDE_DHAKA' ? 44 : 90),
          items: {
            create: {
              productId: productIds.get(slug)!,
              variantId: v.id,
              title: p.title,
              variantLabel: v.label || null,
              imageUrl: null,
              unitPrice: unit,
              originalPrice: v.price,
              quantity: qty,
              lineTotal: subtotal,
              reviewed: true,
            },
          },
          events: {
            create: [
              { status: 'PLACED', title: 'Order placed', actor: 'customer', createdAt: placed },
              { status: 'CONFIRMED', title: 'Order confirmed', actor: 'system', createdAt: at(1) },
              { status: 'PACKED', title: 'Packed and ready to ship', actor: 'admin', createdAt: at(20) },
              { status: 'SHIPPED', title: 'Handed to courier', actor: 'admin', createdAt: at(30) },
              { status: 'DELIVERED', title: 'Delivered', actor: 'admin', createdAt: at(zone === 'INSIDE_DHAKA' ? 44 : 90) },
            ],
          },
        },
        include: { items: true },
      });
      const variantImage = await prisma.productVariant.findUniqueOrThrow({ where: { id: v.id }, select: { imageUrl: true } });
      await prisma.orderItem.update({ where: { id: o.items[0].id }, data: { imageUrl: variantImage.imageUrl } });
      await prisma.payment.create({
        data: {
          orderId: o.id,
          method: o.paymentMethod,
          provider: o.paymentMethod === 'COD' ? 'cod' : 'mock',
          amount: o.total,
          status: 'PAID',
          idempotencyKey: `${o.id}:seed`,
          createdAt: placed,
        },
      });
      await prisma.review.create({
        data: {
          productId: productIds.get(slug)!,
          userId: user.id,
          orderItemId: o.items[0].id,
          rating,
          comment,
          createdAt: at(between(50, 200)),
          reply: rating <= 3 ? 'Thanks for the honest feedback. We have shared it with our quality team.' : rand() < 0.3 ? 'Thank you for shopping with Tuktak Bazaar!' : null,
          repliedAt: rating <= 3 ? at(220) : null,
        },
      });
      delivered += qty;
    }
    const agg = await prisma.review.aggregate({ where: { productId: productIds.get(slug)! }, _avg: { rating: true }, _count: { _all: true } });
    await prisma.product.update({
      where: { id: productIds.get(slug)! },
      data: { ratingAvg: agg._avg.rating ?? 0, ratingCount: agg._count._all, soldCount: p.soldBase + delivered },
    });
  }
  console.log('  reviews and order history created');

  // ───── Questions ─────
  for (const [slug, question, answer] of QUESTIONS) {
    const productId = productIds.get(slug);
    if (!productId) {
      console.warn(`  (question skipped: no product ${slug})`);
      continue;
    }
    await prisma.question.create({
      data: {
        productId,
        userId: pick(reviewers).id,
        question,
        answer: answer ?? null,
        answeredAt: answer ? days(between(1, 20)) : null,
        createdAt: days(between(21, 40)),
      },
    });
  }

  // ───── Flash sale (live now) ─────
  const flashPicks: [string, number, number][] = [
    ['sonora-buds-pro-tws-earbuds', 0.45, 60],
    ['volt-20000mah-power-bank-22-5w', 0.42, 80],
    ['pulse-fit-3-smart-watch', 0.48, 40],
    ['bunon-classic-polo-t-shirt', 0.5, 100],
    ['alo-rechargeable-led-desk-lamp', 0.4, 50],
    ['glow-lab-sunscreen-spf-50-pa', 0.35, 70],
    ['sonora-boom-mini-bluetooth-speaker', 0.45, 45],
    ['ranna-electric-kettle-1-8l', 0.38, 40],
    ['kheya-everyday-backpack-25l', 0.45, 50],
    ['nimbus-a3-smartphone', 0.22, 25],
  ];
  const flash = await prisma.flashSale.create({ data: { title: 'Payday Flash Sale', startsAt: hours(-2), endsAt: hours(22) } });
  for (const [slug, off, limit] of flashPicks) {
    const variants = variantsBySlug.get(slug);
    if (!variants) {
      console.warn(`  (flash item skipped: no product ${slug})`);
      continue;
    }
    const v = variants[0];
    await prisma.flashSaleItem.create({
      data: {
        flashSaleId: flash.id,
        variantId: v.id,
        flashPrice: Math.round((v.price * (1 - off)) / 10) * 10 - 1,
        quantityLimit: limit,
        soldQty: Math.floor(limit * (0.3 + rand() * 0.5)),
        perUserLimit: 2,
      },
    });
  }
  // Next week's sale, so the admin can see a scheduled one.
  await prisma.flashSale.create({ data: { title: '11.11 Mega Flash Sale', startsAt: hours(24 * 6), endsAt: hours(24 * 6 + 12) } });

  // ───── Vouchers ─────
  const voucherData: Prisma.VoucherCreateInput[] = [
    { code: 'WELCOME100', title: '৳100 off your first order', description: 'Min. spend ৳999', type: VoucherType.FIXED, value: 100, minSpend: 999, startsAt: days(30), endsAt: hours(24 * 60), perUserLimit: 1, isCollectible: true },
    { code: 'SAVE10', title: '10% off, up to ৳300', description: 'Min. spend ৳1,500', type: VoucherType.PERCENT, value: 10, maxDiscount: 300, minSpend: 1500, startsAt: days(10), endsAt: hours(24 * 20), usageLimit: 1000, perUserLimit: 2, isCollectible: true },
    { code: 'FREESHIP', title: 'Free delivery', description: 'Min. spend ৳499', type: VoucherType.FREE_SHIPPING, value: 0, minSpend: 499, startsAt: days(5), endsAt: hours(24 * 15), perUserLimit: 3, isCollectible: true },
    { code: 'TECH500', title: '৳500 off electronics over ৳10,000', description: 'Min. spend ৳10,000', type: VoucherType.FIXED, value: 500, minSpend: 10000, startsAt: days(2), endsAt: hours(24 * 10), usageLimit: 200, perUserLimit: 1, isCollectible: true },
    { code: 'EID25', title: 'Eid special 25% off, up to ৳500', description: 'Code only, shared on Facebook', type: VoucherType.PERCENT, value: 25, maxDiscount: 500, minSpend: 2000, startsAt: days(1), endsAt: hours(24 * 7), usageLimit: 300, perUserLimit: 1, isCollectible: false },
  ];
  const vouchers = [];
  for (const v of voucherData) vouchers.push(await prisma.voucher.create({ data: v }));

  // ───── Promo campaigns ─────
  // One live campaign (mystery box) and one scheduled Eid campaign (spin wheel). All shopper-facing text is Bangla.
  const voucherBy = (code: string) => vouchers.find((v) => v.code === code)!;
  const mega50 = await prisma.voucher.create({
    data: { code: 'MEGA50', title: 'মেগা সেল: ৳৫০ ছাড়', description: '৳৯৯৯-এর বেশি অর্ডারে', type: VoucherType.FIXED, value: 50, minSpend: 999, startsAt: hours(-1), endsAt: hours(24 * 7), perUserLimit: 1, isCollectible: true },
  });
  const eidGift = await prisma.voucher.create({
    data: { code: 'EIDGIFT100', title: 'ঈদ উপহার: ৳১০০ ছাড়', description: '৳১৫০০-এর বেশি অর্ডারে', type: VoucherType.FIXED, value: 100, minSpend: 1500, startsAt: hours(24 * 10), endsAt: hours(24 * 15), perUserLimit: 1, isCollectible: false },
  });
  // Floating product art for the banner: two products on a transparent background.
  const heroArt = writeAsset(
    'campaigns/mega-sale-art.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800" width="1200" height="800">
  <g transform="translate(-40 20) scale(0.95)">${illustration('phone', '#2b3040', '#4f8cff', 'cm1')}</g>
  <g transform="translate(430 120) scale(0.85)">${illustration('headphones', '#e9dcc4', '#ff7a45', 'cm2')}</g>
</svg>`,
  );
  const picks = ['pulse-pro-amoled-smart-watch', 'sonora-wave-anc-wireless-headphones', 'ranna-3-in-1-blender-750w', 'bunon-cotton-panjabi']
    .map((slug) => variantsBySlug.get(slug)?.[0]?.id)
    .filter((id): id is string => !!id);
  await prisma.campaign.create({
    data: {
      slug: 'tuktak-mega-sale',
      title: 'টুকটাক মেগা সেল',
      tagline: 'বছরের সবচেয়ে বড় ছাড়',
      theme: 'MEGA_SALE',
      heroImageUrl: heroArt,
      ctaLabel: 'এখনই কিনুন',
      ctaHref: '/flash-sale',
      startsAt: hours(-1),
      endsAt: hours(24 * 7),
      teaserHours: 24,
      priority: 10,
      gameEnabled: true,
      gameStyle: 'MYSTERY_BOX',
      voucherId: mega50.id,
      flashSaleId: flash.id,
      products: { create: picks.map((variantId, i) => ({ variantId, sortOrder: i })) },
      ticker: {
        create: [
          { text: '৳২০০০+ অর্ডারে ঢাকায় ফ্রি ডেলিভারি', href: '/flash-sale', sortOrder: 0 },
          { text: 'bKash-এ পেমেন্টে বিশেষ ছাড়', href: null, sortOrder: 1 },
          { text: 'প্রতিদিন খেলুন — জিতুন ভাউচার ও কয়েন', href: '/#campaign', sortOrder: 2 },
        ],
      },
      rewards: {
        create: [
          { kind: 'VOUCHER', voucherId: mega50.id, label: '৳৫০ ছাড়', weight: 10, stock: 200, sortOrder: 0 },
          { kind: 'COINS', coins: 20, label: '২০ কয়েন', weight: 30, sortOrder: 1 },
          { kind: 'VOUCHER', voucherId: voucherBy('FREESHIP').id, label: 'ফ্রি ডেলিভারি', weight: 20, stock: 300, sortOrder: 2 },
          { kind: 'NONE', label: 'আবার চেষ্টা করুন', weight: 40, sortOrder: 3 },
        ],
      },
    },
  });
  await prisma.campaign.create({
    data: {
      slug: 'eid-utsob-offer',
      title: 'ঈদ উৎসব অফার',
      tagline: 'ঈদের কেনাকাটায় খুশির ছাড়',
      theme: 'EID',
      ctaLabel: 'অফার দেখুন',
      ctaHref: '/categories',
      startsAt: hours(24 * 10),
      endsAt: hours(24 * 14),
      teaserHours: 48,
      priority: 5,
      gameEnabled: true,
      gameStyle: 'SPIN_WHEEL',
      voucherId: voucherBy('SAVE10').id,
      ticker: { create: [{ text: 'ঈদ মোবারক! সব ক্যাটাগরিতে উৎসবের ছাড়', href: '/categories', sortOrder: 0 }] },
      rewards: {
        create: [
          { kind: 'VOUCHER', voucherId: eidGift.id, label: '৳১০০ ছাড়', weight: 5, stock: 100, sortOrder: 0 },
          { kind: 'COINS', coins: 50, label: '৫০ কয়েন', weight: 15, sortOrder: 1 },
          { kind: 'COINS', coins: 20, label: '২০ কয়েন', weight: 30, sortOrder: 2 },
          { kind: 'VOUCHER', voucherId: voucherBy('FREESHIP').id, label: 'ফ্রি ডেলিভারি', weight: 15, stock: 200, sortOrder: 3 },
          { kind: 'COINS', coins: 10, label: '১০ কয়েন', weight: 20, sortOrder: 4 },
          { kind: 'NONE', label: 'আবার চেষ্টা করুন', weight: 15, sortOrder: 5 },
        ],
      },
    },
  });

  // ───── Banners ─────
  const banners: Prisma.BannerCreateInput[] = [
    {
      title: 'Payday Mega Sale',
      subtitle: 'Up to 60% off electronics',
      link: '/flash-sale',
      placement: BannerPlacement.HOME_HERO,
      sortOrder: 0,
      imageUrl: writeAsset('banners/hero-payday.svg', bannerSvg({
        uid: 'h1', title: 'Payday Mega Sale', subtitle: 'Up to 60% off phones, audio and gadgets', cta: 'Shop the sale', badge: 'FLASH DEALS LIVE',
        from: '#0b6e4f', to: '#064e3b',
        art: [
          { kind: 'phone', body: '#2b3040', accent: '#4f8cff', x: 1080, y: 290, scale: 0.62 },
          { kind: 'headphones', body: '#f2f2f2', accent: '#ff7a45', x: 1340, y: 330, scale: 0.55 },
        ],
      })),
    },
    {
      title: 'Eid Fashion Fest',
      subtitle: 'Panjabi, kurti and more from ৳499',
      link: '/category/fashion',
      placement: BannerPlacement.HOME_HERO,
      sortOrder: 1,
      imageUrl: writeAsset('banners/hero-eid.svg', bannerSvg({
        uid: 'h2', title: 'Eid Fashion Fest', subtitle: 'Panjabi, kurti and three-piece from ৳499', cta: 'Explore fashion', badge: 'EID MUBARAK',
        from: '#8a1c3a', to: '#4a0e22',
        art: [
          { kind: 'panjabi', body: '#f3ead8', accent: '#d4af37', x: 1110, y: 300, scale: 0.6 },
          { kind: 'kurti', body: '#1f8a8a', accent: '#f2c14e', x: 1360, y: 310, scale: 0.56 },
        ],
      })),
    },
    {
      title: 'Beat load-shedding',
      subtitle: 'Rechargeable fans, lights and power banks',
      link: '/search?q=rechargeable',
      placement: BannerPlacement.HOME_HERO,
      sortOrder: 2,
      imageUrl: writeAsset('banners/hero-power.svg', bannerSvg({
        uid: 'h3', title: 'Beat load-shedding', subtitle: 'Rechargeable fans, lights and power banks', cta: 'Stay powered', badge: 'FREE DELIVERY OVER ৳2000',
        from: '#1d3a8a', to: '#0f1f4d',
        art: [
          { kind: 'fan', body: '#e9edf2', accent: '#38b6ff', x: 1130, y: 290, scale: 0.56 },
          { kind: 'powerbank', body: '#2b3040', accent: '#3ddc84', x: 1370, y: 320, scale: 0.5 },
        ],
      })),
    },
    {
      title: 'Collect vouchers',
      subtitle: 'Save up to ৳500 today',
      link: '/vouchers',
      placement: BannerPlacement.HOME_STRIP,
      sortOrder: 0,
      imageUrl: writeAsset('banners/strip-vouchers.svg', stripSvg('Collect vouchers', 'Save up to ৳500 on today\'s orders', '#ff6a3d', '#e8452c', 'tote', '#fff3e0', '#ffb020', 'v')),
    },
    {
      title: 'Daily check-in',
      subtitle: 'Earn coins every day',
      link: '/account/coins',
      placement: BannerPlacement.HOME_STRIP,
      sortOrder: 1,
      imageUrl: writeAsset('banners/strip-coins.svg', stripSvg('Daily check-in', 'Earn coins and pay with them at checkout', '#7c5cff', '#5b3fd6', 'mug', '#ffd166', '#ffffff', 'c')),
    },
  ];
  for (const b of banners) await prisma.banner.create({ data: b });

  // ───── Demo customer with history ─────
  const demo = await prisma.user.create({
    data: {
      name: 'Ayesha Siddika',
      phone: '01711111111',
      email: 'ayesha@example.com',
      passwordHash: customerHash,
      coins: 0,
      createdAt: days(120),
      cart: { create: {} },
      addresses: {
        create: [
          { fullName: 'Ayesha Siddika', phone: '01711111111', division: 'Dhaka', district: 'Dhaka', area: 'Dhanmondi', line: 'House 27, Road 9/A', label: 'Home', isDefault: true },
          { fullName: 'Ayesha Siddika', phone: '01711111111', division: 'Chattogram', district: 'Chattogram', area: 'GEC Circle', line: 'Level 5, Sanmar Tower, O.R. Nizam Road', label: 'Office' },
        ],
      },
    },
    include: { addresses: true, cart: true },
  });
  const home = demo.addresses.find((a) => a.isDefault)!;

  async function demoOrder(opts: {
    items: { slug: string; vi?: number; qty: number }[];
    status: 'DELIVERED' | 'SHIPPED' | 'PACKED' | 'CONFIRMED';
    method: 'COD' | 'BKASH';
    placedDaysAgo: number;
  }) {
    const lines = opts.items.map(({ slug, vi = 0, qty }) => {
      const v = variantsBySlug.get(slug)![vi];
      const p = PRODUCTS.find((x) => slugify(x.title) === slug)! as ProductSeed;
      return { slug, v, qty, p, unit: v.salePrice ?? v.price };
    });
    const subtotal = lines.reduce((s, l) => s + l.unit * l.qty, 0);
    const placed = days(opts.placedDaysAgo);
    const at = (h: number) => new Date(placed.getTime() + h * 3600000);
    const reached = ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'].indexOf(opts.status);
    const events: Prisma.OrderEventCreateWithoutOrderInput[] = [
      { status: 'PLACED', title: 'Order placed', note: opts.method === 'COD' ? 'Cash on delivery' : 'Paid with bKash', actor: 'customer', createdAt: placed },
      { status: 'CONFIRMED', title: 'Order confirmed', note: 'Confirmed automatically', actor: 'system', createdAt: at(0.2) },
    ];
    if (reached >= 1) events.push({ status: 'PACKED', title: 'Packed and ready to ship', actor: 'admin', createdAt: at(6) });
    if (reached >= 2) events.push({ status: 'SHIPPED', title: 'Handed to courier', note: 'Steadfast · tracking SF48213976', actor: 'admin', createdAt: at(18) });
    if (reached >= 3) events.push({ status: 'DELIVERED', title: 'Delivered', actor: 'admin', createdAt: at(30) });
    const o = await prisma.order.create({
      data: {
        orderNo: orderNo(),
        userId: demo.id,
        status: opts.status,
        paymentMethod: opts.method,
        paymentStatus: opts.method === 'COD' && opts.status !== 'DELIVERED' ? 'UNPAID' : 'PAID',
        subtotal,
        shippingFee: 60,
        shippingDiscount: subtotal >= 2000 ? 60 : 0,
        total: subtotal + (subtotal >= 2000 ? 0 : 60),
        shipName: home.fullName,
        shipPhone: home.phone,
        shipDivision: home.division,
        shipDistrict: home.district,
        shipArea: home.area,
        shipLine: home.line,
        zone: 'INSIDE_DHAKA',
        courier: reached >= 2 ? 'Steadfast' : null,
        trackingNo: reached >= 2 ? 'SF48213976' : null,
        coinsAwarded: opts.status === 'DELIVERED',
        placedAt: placed,
        createdAt: placed,
        confirmedAt: at(0.2),
        packedAt: reached >= 1 ? at(6) : null,
        shippedAt: reached >= 2 ? at(18) : null,
        deliveredAt: reached >= 3 ? at(30) : null,
        items: {
          create: await Promise.all(
            lines.map(async (l) => ({
              productId: productIds.get(l.slug)!,
              variantId: l.v.id,
              title: l.p.title,
              variantLabel: l.v.label || null,
              imageUrl: (await prisma.productVariant.findUniqueOrThrow({ where: { id: l.v.id } })).imageUrl,
              unitPrice: l.unit,
              originalPrice: l.v.price,
              quantity: l.qty,
              lineTotal: l.unit * l.qty,
            })),
          ),
        },
        events: { create: events },
      },
    });
    await prisma.payment.create({
      data: {
        orderId: o.id,
        method: opts.method,
        provider: opts.method === 'COD' ? 'cod' : 'mock',
        amount: o.total,
        status: opts.method === 'COD' && opts.status !== 'DELIVERED' ? 'PENDING' : 'PAID',
        idempotencyKey: `${o.id}:seed`,
        createdAt: placed,
      },
    });
    return o;
  }

  const delivered = await demoOrder({
    items: [{ slug: 'sonora-buds-pro-tws-earbuds', qty: 1 }, { slug: 'bunon-classic-polo-t-shirt', vi: 1, qty: 2 }],
    status: 'DELIVERED',
    method: 'COD',
    placedDaysAgo: 3,
  });
  await demoOrder({ items: [{ slug: 'volt-20000mah-power-bank-22-5w', qty: 1 }], status: 'SHIPPED', method: 'BKASH', placedDaysAgo: 1 });
  await demoOrder({ items: [{ slug: 'ranna-electric-kettle-1-8l', qty: 1 }], status: 'CONFIRMED', method: 'COD', placedDaysAgo: 0.2 });
  // Packed and waiting for a courier booking
  await demoOrder({ items: [{ slug: 'alo-rechargeable-table-fan-12', qty: 1 }], status: 'PACKED', method: 'COD', placedDaysAgo: 0.6 });
  const shippedOrder = (await prisma.order.findFirst({ where: { userId: demo.id, status: 'SHIPPED' } }))!;

  const coinTxns: [number, CoinReason, string, number][] = [
    [5, CoinReason.CHECK_IN, 'Daily check-in', 9],
    [5, CoinReason.CHECK_IN, 'Daily check-in', 6],
    [10, CoinReason.REVIEW_REWARD, 'Review of Sonora Wave ANC Wireless Headphones', 40],
    [Math.floor(delivered.total / 100), CoinReason.ORDER_REWARD, `Order ${delivered.orderNo} delivered`, 1],
    [5, CoinReason.CHECK_IN, 'Daily check-in', 2],
    [100, CoinReason.ADJUSTMENT, 'Welcome bonus', 120],
  ];
  let balance = 0;
  for (const [amount, reason, note, ago] of coinTxns) {
    balance += amount;
    await prisma.coinTransaction.create({ data: { userId: demo.id, amount, reason, note, createdAt: days(ago) } });
  }
  await prisma.user.update({ where: { id: demo.id }, data: { coins: balance } });

  await prisma.userVoucher.create({ data: { userId: demo.id, voucherId: vouchers.find((v) => v.code === 'SAVE10')!.id } });
  await prisma.userVoucher.create({ data: { userId: demo.id, voucherId: vouchers.find((v) => v.code === 'FREESHIP')!.id } });
  for (const slug of ['orbit-book-14-laptop', 'kheya-leather-tote-bag', 'pulse-pro-amoled-smart-watch']) {
    await prisma.wishlistItem.create({ data: { userId: demo.id, productId: productIds.get(slug)! } });
  }
  await prisma.cartItem.create({ data: { cartId: demo.cart!.id, variantId: variantsBySlug.get('nimbus-x5-5g-smartphone')![0].id, quantity: 1 } });
  await prisma.cartItem.create({ data: { cartId: demo.cart!.id, variantId: variantsBySlug.get('glow-lab-vitamin-c-serum-30ml')![0].id, quantity: 2 } });
  await prisma.notification.createMany({
    data: [
      { userId: demo.id, type: 'order', title: 'Delivered', body: `Order ${delivered.orderNo} was delivered. Rate your items to earn coins.`, link: '/account/reviews', createdAt: days(2) },
      { userId: demo.id, type: 'promo', title: 'Payday Flash Sale is live', body: 'Up to 60% off for the next 22 hours. Limited stock!', link: '/flash-sale', createdAt: hours(-2) },
    ],
  });

  // ───── Staff ─────
  const staffHash = await hash('staff1234', 10);
  const rafi = await prisma.user.create({
    data: { name: 'Rafi Ahmed', phone: '01700000001', email: 'rafi@tuktakbazaar.local', passwordHash: staffHash, role: 'STAFF', permissions: ['ORDERS', 'SUPPORT'], cart: { create: {} } },
  });
  await prisma.user.create({
    data: { name: 'Nusrat Jahan', phone: '01700000002', email: 'nusrat@tuktakbazaar.local', passwordHash: staffHash, role: 'STAFF', permissions: ['CATALOG', 'MARKETING'], cart: { create: {} } },
  });

  // ───── Support tickets ─────
  await prisma.supportTicket.create({
    data: {
      ticketNo: 'T2610150001',
      userId: demo.id,
      orderId: shippedOrder.id,
      category: 'DELIVERY',
      subject: 'When will my power bank arrive?',
      status: 'PENDING',
      priority: 'HIGH',
      assigneeId: rafi.id,
      createdAt: hours(-20),
      lastMessageAt: hours(-18),
      messages: {
        create: [
          { authorId: demo.id, fromStaff: false, body: 'I paid with bKash yesterday. The tracking page has not changed since the morning. Will it come today?', createdAt: hours(-20) },
          {
            authorId: rafi.id,
            fromStaff: true,
            body: 'Hi Ayesha, Steadfast has your parcel at their Dhanmondi hub and it is out for delivery today. The rider will call you before coming. Reply here if it does not arrive by 8 pm.',
            createdAt: hours(-18),
          },
        ],
      },
    },
  });
  await prisma.supportTicket.create({
    data: {
      ticketNo: 'T2610010002',
      userId: demo.id,
      category: 'ACCOUNT',
      subject: 'Change the email on my account',
      status: 'RESOLVED',
      assigneeId: rafi.id,
      createdAt: days(15),
      lastMessageAt: days(14),
      resolvedAt: days(14),
      messages: {
        create: [
          { authorId: demo.id, fromStaff: false, body: 'Please change my email to ayesha@example.com, I no longer use the old one.', createdAt: days(15) },
          { authorId: rafi.id, fromStaff: true, body: 'Done. You can also change it yourself any time under Account → Profile.', createdAt: days(14) },
        ],
      },
    },
  });
  const unhappy = reviewers[2] ?? reviewers[0];
  await prisma.supportTicket.create({
    data: {
      ticketNo: 'T2610160003',
      userId: unhappy.id,
      category: 'RETURN_REFUND',
      subject: 'Panjabi size is too small',
      status: 'OPEN',
      createdAt: hours(-3),
      lastMessageAt: hours(-3),
      messages: {
        create: [{ authorId: unhappy.id, fromStaff: false, body: 'The L size fits like an M. Can I exchange it for XL instead of returning it?', createdAt: hours(-3) }],
      },
    },
  });

  console.log('\nDone. Log in with:');
  console.log('  Admin     01700000000 / admin1234   (or admin@tuktakbazaar.local)');
  console.log('  Staff     01700000001 / staff1234   (orders and support)');
  console.log('            01700000002 / staff1234   (catalog and marketing)');
  console.log('  Customer  01711111111 / customer123');
  void admin;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
