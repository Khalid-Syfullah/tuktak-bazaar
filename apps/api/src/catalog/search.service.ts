import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type SortKey = 'relevance' | 'popular' | 'newest' | 'price_asc' | 'price_desc' | 'rating' | 'for_you';

export interface SearchParams {
  q?: string;
  categoryIds?: string[];
  brandSlugs?: string[];
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  sort?: SortKey;
  page: number;
  limit: number;
}

interface Row {
  id: string;
  total: number;
}

/**
 * Product search in plain Postgres.
 * - Each query word is expanded through the synonym table (Bangla ⇄ Banglish ⇄ English).
 * - A word scores 3 in the title, 2 in keywords or brand, 1 in the category name.
 * - Trigram word_similarity on title + keywords catches typos ("samsng", "hedphone").
 */
@Injectable()
export class SearchService {
  private synonymCache: { map: Map<string, string[]>; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  private sanitize(term: string) {
    // Strip LIKE and regex metacharacters so terms are always literal.
    return term.toLowerCase().replace(/[%_\\'"`.*+?^${}()|[\]]/g, '').trim();
  }

  async expandTerms(q: string): Promise<string[]> {
    const map = await this.synonyms();
    const tokens = q.split(/\s+/).map((t) => this.sanitize(t)).filter((t) => t.length >= 2 || /[^\x00-\x7F]/.test(t));
    const out = new Set<string>();
    const phrase = this.sanitize(q);
    if (tokens.length > 1 && phrase) out.add(phrase);
    for (const token of tokens) {
      out.add(token);
      for (const syn of map.get(token) ?? []) out.add(syn);
    }
    return [...out].slice(0, 20);
  }

  private async synonyms(): Promise<Map<string, string[]>> {
    if (this.synonymCache && Date.now() - this.synonymCache.at < 5 * 60_000) return this.synonymCache.map;
    const rows = await this.prisma.searchSynonym.findMany();
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const group = [row.term, ...row.synonyms].map((s) => this.sanitize(s)).filter(Boolean);
      for (const word of group) map.set(word, [...new Set([...(map.get(word) ?? []), ...group.filter((g) => g !== word)])]);
    }
    this.synonymCache = { map, at: Date.now() };
    return map;
  }

  /**
   * Latin terms must match at the start of a word ("phone" finds "Phone", not "headphones");
   * Bangla terms match anywhere, since Postgres word boundaries don't cover Bengali script.
   */
  private scoreSql(terms: string[]) {
    const m = (field: Prisma.Sql) =>
      Prisma.sql`(CASE WHEN t ~ '^[a-z0-9 /-]+$' THEN ${field} ~ ('(^|[^a-z0-9])' || t) ELSE ${field} LIKE '%' || t || '%' END)`;
    return Prisma.sql`(SELECT coalesce(sum(CASE
        WHEN ${m(Prisma.sql`lower(p.title)`)} THEN 3
        WHEN ${m(Prisma.sql`lower(p.keywords)`)} THEN 2
        WHEN ${m(Prisma.sql`lower(coalesce(b.name, ''))`)} THEN 2
        WHEN ${m(Prisma.sql`lower(c.name)`)} OR coalesce(c."nameBn", '') LIKE '%' || t || '%' THEN 1
        ELSE 0 END), 0) FROM unnest(${terms}::text[]) AS t)`;
  }

  private async base(params: SearchParams, opts: { ignoreBrand?: boolean } = {}) {
    const q = params.q?.trim();
    const terms = q ? await this.expandTerms(q) : [];
    const termScore = q ? this.scoreSql(terms) : Prisma.sql`0`;
    const trigram = q ? Prisma.sql`word_similarity(${q.toLowerCase()}, lower(p.title || ' ' || p.keywords))` : Prisma.sql`0`;
    const where: Prisma.Sql[] = [Prisma.sql`p.status = 'ACTIVE'`];
    if (params.categoryIds?.length) where.push(Prisma.sql`p."categoryId" = ANY(${params.categoryIds}::text[])`);
    if (!opts.ignoreBrand && params.brandSlugs?.length) where.push(Prisma.sql`b.slug = ANY(${params.brandSlugs}::text[])`);
    if (params.minRating) where.push(Prisma.sql`p."ratingAvg" >= ${params.minRating}`);

    const outer: Prisma.Sql[] = [Prisma.sql`price IS NOT NULL`];
    // A product qualifies by matching a term, or by being a close typo of the query.
    // Short queries need a closer typo match ("fan" should not find "face serum").
    if (q) outer.push(Prisma.sql`(tscore > 0 OR trgm >= ${q.length <= 4 ? 0.75 : 0.45})`);
    if (params.minPrice != null) outer.push(Prisma.sql`price >= ${params.minPrice}`);
    if (params.maxPrice != null) outer.push(Prisma.sql`price <= ${params.maxPrice}`);

    return Prisma.sql`
      SELECT * FROM (
        SELECT p.id, p."soldCount", p."ratingAvg", p."ratingCount", p."createdAt",
               EXISTS (SELECT 1 FROM "ProductImage" pi WHERE pi."productId" = p.id) AS "hasImage",
               b.slug AS "brandSlug", b.name AS "brandName",
               pr.price AS price, ${termScore} AS tscore, ${trigram} AS trgm,
               ${termScore} + 2 * ${trigram} AS score
        FROM "Product" p
        JOIN "Category" c ON c.id = p."categoryId"
        LEFT JOIN "Brand" b ON b.id = p."brandId"
        LEFT JOIN LATERAL (
          -- Lowest price a shopper would pay right now, live flash-sale prices included
          SELECT min(LEAST(coalesce(v."salePrice", v.price), coalesce(f.fp, 2147483647))) AS price
          FROM "ProductVariant" v
          LEFT JOIN LATERAL (
            SELECT min(fi."flashPrice") AS fp
            FROM "FlashSaleItem" fi JOIN "FlashSale" fs ON fs.id = fi."flashSaleId"
            WHERE fi."variantId" = v.id AND fs."isActive" AND fs."startsAt" <= now() AND fs."endsAt" > now()
              AND fi."soldQty" < fi."quantityLimit"
          ) f ON true
          WHERE v."productId" = p.id AND v."isActive"
        ) pr ON true
        WHERE ${Prisma.join(where, ' AND ')}
      ) x
      WHERE ${Prisma.join(outer, ' AND ')}`;
  }

  private orderBy(sort: SortKey | undefined, hasQuery: boolean) {
    switch (sort) {
      case 'popular':
        return Prisma.sql`"soldCount" DESC, "ratingAvg" DESC`;
      case 'newest':
        return Prisma.sql`"createdAt" DESC`;
      case 'price_asc':
        return Prisma.sql`price ASC`;
      case 'price_desc':
        return Prisma.sql`price DESC`;
      case 'rating':
        return Prisma.sql`"ratingAvg" DESC, "ratingCount" DESC`;
      case 'for_you':
        // The home page's "Just for you": products with photos first, in an order that changes
        // every day (Dhaka date) but stays fixed within the day, so "Load more" pages never repeat.
        return Prisma.sql`"hasImage" DESC, md5(id || to_char(now() AT TIME ZONE 'Asia/Dhaka', 'YYYY-MM-DD'))`;
      default:
        return hasQuery ? Prisma.sql`score DESC, "soldCount" DESC` : Prisma.sql`"soldCount" DESC, "ratingAvg" DESC`;
    }
  }

  async search(params: SearchParams): Promise<{ ids: string[]; total: number }> {
    const base = await this.base(params);
    const offset = (params.page - 1) * params.limit;
    const rows = await this.prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT id, (count(*) OVER())::int AS total FROM (${base}) s
      ORDER BY ${this.orderBy(params.sort, !!params.q?.trim())}, id
      LIMIT ${params.limit} OFFSET ${offset}`);
    if (rows.length) return { ids: rows.map((r) => r.id), total: rows[0].total };
    if (offset === 0) return { ids: [], total: 0 };
    const count = await this.prisma.$queryRaw<{ total: number }[]>(Prisma.sql`SELECT count(*)::int AS total FROM (${base}) s`);
    return { ids: [], total: count[0]?.total ?? 0 };
  }

  /** Brand counts and the price range for the current query, ignoring the brand and price filters. */
  async facets(params: SearchParams) {
    const base = await this.base({ ...params, minPrice: undefined, maxPrice: undefined }, { ignoreBrand: true });
    const brands = await this.prisma.$queryRaw<{ slug: string; name: string; count: number }[]>(Prisma.sql`
      SELECT "brandSlug" AS slug, "brandName" AS name, count(*)::int AS count FROM (${base}) s
      WHERE "brandSlug" IS NOT NULL GROUP BY "brandSlug", "brandName" ORDER BY count DESC, name LIMIT 30`);
    const range = await this.prisma.$queryRaw<{ min: number | null; max: number | null }[]>(Prisma.sql`
      SELECT min(price)::int AS min, max(price)::int AS max FROM (${base}) s`);
    return { brands, priceRange: { min: range[0]?.min ?? 0, max: range[0]?.max ?? 0 } };
  }
}
