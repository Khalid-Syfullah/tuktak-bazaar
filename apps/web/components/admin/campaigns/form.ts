/** Campaign editor state: defaults, validation, request bodies and mapping API errors back to fields. */
import { fromDhakaInput, toDhakaInput } from '@/components/admin/catalog/utils';
import { ApiError } from '@/lib/api';
import { THEME_LABEL, type CampaignTheme, type GameStyle, type RewardKind } from '@/lib/campaign';
import {
  bn,
  type CampaignBody,
  type CampaignDetail,
  type CampaignProductRow,
  LINK_RE,
  MAX_PRODUCTS,
  MAX_REWARDS,
  MAX_TICKER,
  REWARD_RULE,
  SLUG_RE,
  type VoucherOption,
  voucherRewardLabel,
} from './types';

export interface TickerRow {
  key: string;
  text: string;
  href: string;
}

export interface RewardRow {
  key: string;
  /** Saved rewards keep their id so stock already won stays counted. */
  id?: string;
  kind: RewardKind;
  voucherId: string;
  coins: string;
  label: string;
  /** True while the label is the one we suggested, so it follows kind / voucher / coins changes. */
  autoLabel: boolean;
  weight: string;
  stock: string;
  givenCount: number;
}

export interface CampaignForm {
  title: string;
  tagline: string;
  slug: string;
  /** False until the admin types a slug, so new campaigns get one suggested. */
  slugTouched: boolean;
  startsAt: string;
  endsAt: string;
  teaserHours: string;
  priority: string;
  isActive: boolean;
  theme: CampaignTheme;
  heroImageUrl: string;
  confetti: boolean;
  ctaLabel: string;
  ctaHref: string;
  flashSaleId: string;
  products: CampaignProductRow[];
  ticker: TickerRow[];
  voucherId: string;
  gameEnabled: boolean;
  gameStyle: GameStyle;
  rewards: RewardRow[];
}

export type Errors = Record<string, string>;

let seq = 0;
export const uid = (p = 'r') => `${p}${++seq}`;

const whole = (s: string) => s.trim() !== '' && Number.isInteger(Number(s));

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/, '');
}

/** A slug from any English in the title, else the theme and start date ("mega-sale-2026-11-11"), else "campaign-<date>". */
export function suggestSlug(f: Pick<CampaignForm, 'title' | 'theme' | 'startsAt'>): string {
  const latin = slugify(f.title);
  if (latin.length >= 3) return latin;
  const day = (f.startsAt || toDhakaInput(new Date())).slice(0, 10);
  const theme = slugify(THEME_LABEL[f.theme] ?? '');
  return theme ? `${theme}-${day}` : `campaign-${day}`;
}

export function rewardAutoLabel(r: Pick<RewardRow, 'kind' | 'voucherId' | 'coins'>, vouchers: VoucherOption[]): string {
  if (r.kind === 'NONE') return 'আবার চেষ্টা করুন';
  if (r.kind === 'COINS') return whole(r.coins) && Number(r.coins) > 0 ? `${bn(r.coins)} কয়েন` : '';
  const v = vouchers.find((x) => x.id === r.voucherId);
  return v ? voucherRewardLabel(v) : '';
}

export function newReward(kind: RewardKind, patch: Partial<RewardRow> = {}): RewardRow {
  const base: RewardRow = { key: uid('w'), kind, voucherId: '', coins: kind === 'COINS' ? '20' : '', label: '', autoLabel: true, weight: '10', stock: '', givenCount: 0, ...patch };
  if (base.autoLabel && !base.label) base.label = rewardAutoLabel(base, []);
  return base;
}

export function emptyForm(): CampaignForm {
  const start = new Date(Date.now() + 24 * 3600_000);
  start.setMinutes(0, 0, 0);
  const startsAt = toDhakaInput(start);
  const f: CampaignForm = {
    title: '',
    tagline: '',
    slug: '',
    slugTouched: false,
    startsAt,
    endsAt: toDhakaInput(new Date(start.getTime() + 3 * 24 * 3600_000)),
    teaserHours: '24',
    priority: '0',
    isActive: true,
    theme: 'MEGA_SALE',
    heroImageUrl: '',
    confetti: true,
    ctaLabel: 'এখনই কিনুন',
    ctaHref: '/flash-sale',
    flashSaleId: '',
    products: [],
    ticker: [],
    voucherId: '',
    gameEnabled: false,
    gameStyle: 'MYSTERY_BOX',
    rewards: [],
  };
  f.slug = suggestSlug(f);
  return f;
}

export function formFromDetail(d: CampaignDetail): CampaignForm {
  return {
    title: d.title,
    tagline: d.tagline ?? '',
    slug: d.slug,
    slugTouched: true,
    startsAt: toDhakaInput(d.startsAt),
    endsAt: toDhakaInput(d.endsAt),
    teaserHours: String(d.teaserHours),
    priority: String(d.priority),
    isActive: d.isActive,
    theme: d.theme,
    heroImageUrl: d.heroImageUrl ?? '',
    confetti: d.confetti,
    ctaLabel: d.ctaLabel,
    ctaHref: d.ctaHref,
    flashSaleId: d.flashSaleId ?? '',
    products: d.products,
    ticker: [...d.ticker].sort((a, b) => a.sortOrder - b.sortOrder).map((t) => ({ key: uid('t'), text: t.text, href: t.href ?? '' })),
    voucherId: d.voucherId ?? '',
    gameEnabled: d.gameEnabled,
    gameStyle: d.gameStyle,
    rewards: [...d.rewards]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((r) => ({
        key: uid('w'),
        id: r.id,
        kind: r.kind,
        voucherId: r.voucherId ?? '',
        coins: r.coins != null ? String(r.coins) : '',
        label: r.label,
        autoLabel: false,
        weight: String(r.weight),
        stock: r.stock != null ? String(r.stock) : '',
        givenCount: r.givenCount,
      })),
  };
}

/** Rewards that are out of stock can't be won, so they don't count towards the odds (same rule as the store). */
export function soldOut(r: RewardRow) {
  return whole(r.stock) && r.givenCount >= Number(r.stock);
}

/** Live odds in percent per reward key: weight ÷ total weight of the rewards that can still be won. */
export function oddsFor(rewards: RewardRow[]): Map<string, number | null> {
  const weightOf = (r: RewardRow) => (whole(r.weight) && Number(r.weight) >= 1 ? Number(r.weight) : 0);
  const total = rewards.reduce((s, r) => s + (soldOut(r) ? 0 : weightOf(r)), 0);
  return new Map(rewards.map((r) => [r.key, soldOut(r) ? 0 : total && weightOf(r) ? (weightOf(r) / total) * 100 : null]));
}

/** Checks the form the same way the API does; returns field errors keyed by field, `ticker:<key>` or `reward:<key>`. */
export function validate(f: CampaignForm): Errors {
  const e: Errors = {};
  const title = f.title.trim();
  if (title.length < 2) e.title = 'Enter a title of at least 2 characters';
  if (!SLUG_RE.test(f.slug)) e.slug = 'Use lowercase English letters, numbers and single dashes';
  const startsAt = fromDhakaInput(f.startsAt);
  const endsAt = fromDhakaInput(f.endsAt);
  if (!startsAt) e.startsAt = 'Pick a start date and time';
  if (!endsAt) e.endsAt = 'Pick an end date and time';
  else if (startsAt && endsAt <= startsAt) e.endsAt = 'The end must be after the start';
  if (!whole(f.teaserHours) || Number(f.teaserHours) < 0 || Number(f.teaserHours) > 168) e.teaserHours = 'Enter 0 to 168 hours';
  if (!whole(f.priority) || Number(f.priority) < -100 || Number(f.priority) > 100) e.priority = 'Enter a whole number from -100 to 100';
  if (!f.ctaLabel.trim()) e.ctaLabel = 'Enter the button text';
  if (!LINK_RE.test(f.ctaHref.trim())) e.ctaHref = 'Links start with / or https://';
  if (f.products.length > MAX_PRODUCTS) e.products = `Pick up to ${MAX_PRODUCTS} products`;
  if (f.ticker.length > MAX_TICKER) e.ticker = `Use up to ${MAX_TICKER} items`;
  f.ticker.forEach((t, i) => {
    const m: string[] = [];
    if (!t.text.trim()) m.push('enter the text');
    if (t.href.trim() && !LINK_RE.test(t.href.trim())) m.push('links start with / or https://');
    if (m.length) e[`ticker:${t.key}`] = `Item ${i + 1}: ${m.join(', ')}`;
  });
  if (f.rewards.length > MAX_REWARDS) e.rewards = `Use up to ${MAX_REWARDS} rewards`;
  f.rewards.forEach((r, i) => {
    const m: string[] = [];
    if (!r.label.trim()) m.push('enter a label');
    if (r.kind === 'VOUCHER' && !r.voucherId) m.push('pick the voucher');
    if (r.kind === 'COINS' && (!whole(r.coins) || Number(r.coins) < 1 || Number(r.coins) > 10000)) m.push('coins must be 1 to 10,000');
    if (!whole(r.weight) || Number(r.weight) < 1 || Number(r.weight) > 10000) m.push('weight must be 1 to 10,000');
    if (r.stock.trim() && (!whole(r.stock) || Number(r.stock) < 0)) m.push('stock must be a whole number or blank');
    else if (r.stock.trim() && Number(r.stock) < r.givenCount) m.push(`stock can't go below the ${r.givenCount} already won`);
    if (m.length) e[`reward:${r.key}`] = `Reward ${i + 1}: ${m.join(', ')}`;
  });
  if (f.gameEnabled) {
    const rule = REWARD_RULE[f.gameStyle];
    if (f.rewards.length < rule.min || f.rewards.length > rule.max) {
      e.game = f.gameStyle === 'SPIN_WHEEL' ? 'A spin wheel needs 4 to 10 rewards' : 'A mystery box needs 2 to 10 rewards';
    }
  }
  return e;
}

export function toBody(f: CampaignForm): CampaignBody {
  return {
    slug: f.slug.trim(),
    title: f.title.trim(),
    tagline: f.tagline.trim() || null,
    theme: f.theme,
    heroImageUrl: f.heroImageUrl.trim() || null,
    ctaLabel: f.ctaLabel.trim(),
    ctaHref: f.ctaHref.trim(),
    startsAt: fromDhakaInput(f.startsAt) ?? '',
    endsAt: fromDhakaInput(f.endsAt) ?? '',
    teaserHours: Number(f.teaserHours),
    priority: Number(f.priority),
    confetti: f.confetti,
    gameEnabled: f.gameEnabled,
    gameStyle: f.gameStyle,
    isActive: f.isActive,
    voucherId: f.voucherId || null,
    flashSaleId: f.flashSaleId || null,
    productIds: f.products.map((p) => p.variantId),
    ticker: f.ticker.map((t) => ({ text: t.text.trim(), href: t.href.trim() || null })),
    rewards: f.rewards.map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      kind: r.kind,
      voucherId: r.kind === 'VOUCHER' ? r.voucherId || null : null,
      coins: r.kind === 'COINS' ? Number(r.coins) : null,
      label: r.label.trim(),
      weight: Number(r.weight),
      stock: r.stock.trim() ? Number(r.stock) : null,
    })),
  };
}

/**
 * A preview body that the API accepts while the form is still half filled in: rows that aren't finished are left out
 * and fields shoppers never see fall back to safe values. Returns the reason instead when a visible field is missing.
 */
export function previewBody(f: CampaignForm): { body: CampaignBody } | { missing: string } {
  const startsAt = fromDhakaInput(f.startsAt);
  const endsAt = fromDhakaInput(f.endsAt);
  if (!startsAt || !endsAt) return { missing: 'Set the start and end to see the preview.' };
  if (endsAt <= startsAt) return { missing: 'The end must be after the start to show a preview.' };
  if (f.title.trim().length < 2) return { missing: 'Add a title (at least 2 characters) to see the preview.' };
  if (!f.ctaLabel.trim()) return { missing: 'Add the button text to see the preview.' };
  if (!LINK_RE.test(f.ctaHref.trim())) return { missing: 'Fix the button link (it starts with / or https://) to see the preview.' };
  const body = toBody(f);
  const num = (s: string, min: number, max: number, fallback: number) => (whole(s) && Number(s) >= min && Number(s) <= max ? Number(s) : fallback);
  return {
    body: {
      ...body,
      slug: SLUG_RE.test(body.slug) ? body.slug : 'preview',
      teaserHours: num(f.teaserHours, 0, 168, 0),
      priority: num(f.priority, -100, 100, 0),
      productIds: body.productIds.slice(0, MAX_PRODUCTS),
      ticker: f.ticker
        .filter((t) => t.text.trim())
        .slice(0, MAX_TICKER)
        .map((t) => ({ text: t.text.trim(), href: LINK_RE.test(t.href.trim()) ? t.href.trim() : null })),
      rewards: f.rewards
        .filter((r) => r.label.trim() && whole(r.weight) && Number(r.weight) >= 1 && Number(r.weight) <= 10000)
        .slice(0, MAX_REWARDS)
        .map((r) => ({
          ...(r.id ? { id: r.id } : {}),
          kind: r.kind,
          // The preview works out odds from the voucher, so send it (and the coins) as a save would.
          voucherId: r.kind === 'VOUCHER' ? r.voucherId || null : null,
          coins: r.kind === 'COINS' && whole(r.coins) && Number(r.coins) >= 1 && Number(r.coins) <= 10000 ? Number(r.coins) : null,
          label: r.label.trim(),
          weight: Number(r.weight),
          stock: whole(r.stock) && Number(r.stock) >= 0 ? Number(r.stock) : null,
        })),
    },
  };
}

const FIELD_NAMES: Record<string, string> = {
  slug: 'slug',
  title: 'title',
  tagline: 'tagline',
  theme: 'theme',
  heroImageUrl: 'heroImageUrl',
  ctaLabel: 'ctaLabel',
  ctaHref: 'ctaHref',
  startsAt: 'startsAt',
  endsAt: 'endsAt',
  teaserHours: 'teaserHours',
  priority: 'priority',
  voucherId: 'voucherId',
  flashSaleId: 'flashSaleId',
  productIds: 'products',
  ticker: 'ticker',
  rewards: 'rewards',
  confetti: 'form',
  gameEnabled: 'game',
  gameStyle: 'game',
  isActive: 'form',
};

const ROW_LABEL: Record<string, string> = { ticker: 'Offer strip item', rewards: 'Reward' };

/** Works out which field an API error belongs to. Unknown messages go to `form` (shown at the top). */
export function errorsFromApi(err: unknown, f: CampaignForm, vouchers: VoucherOption[]): Errors {
  const raw = err instanceof ApiError && err.data && typeof err.data === 'object' && 'message' in err.data ? (err.data as { message: unknown }).message : null;
  const messages = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? [raw] : [err instanceof Error ? err.message : 'Something went wrong'];
  const out: Errors = {};
  const add = (key: string, msg: string) => {
    out[key] = out[key] ? `${out[key]}. ${msg}` : msg;
  };
  for (const msg of messages) {
    // class-validator: "ticker.0.text must be …" / "rewards.2.Links start with …" / "slug must be …"
    const nested = /^(ticker|rewards)\.(\d+)\.(?:([a-zA-Z]+) )?(.*)$/.exec(msg);
    if (nested) {
      const [, list, idx, prop, rest] = nested;
      const n = Number(idx);
      const text = `${ROW_LABEL[list]} ${n + 1}: ${prop ? `${prop} ` : ''}${rest}`;
      const row = list === 'ticker' ? f.ticker[n] : f.rewards[n];
      add(row ? `${list === 'ticker' ? 'ticker' : 'reward'}:${row.key}` : list, text);
      continue;
    }
    const prop = /^([a-zA-Z]+) (must|should|is|has)\b/.exec(msg)?.[1];
    if (prop && FIELD_NAMES[prop]) {
      add(FIELD_NAMES[prop], msg);
      continue;
    }
    const code = /^Voucher (\S+) /.exec(msg)?.[1];
    if (code) {
      const collect = vouchers.find((v) => v.id === f.voucherId);
      if (/to show on the banner/.test(msg) || (collect?.code === code && !/reward/.test(msg))) add('voucherId', msg);
      else {
        const v = vouchers.find((x) => x.code === code);
        const row = v && f.rewards.find((r) => r.kind === 'VOUCHER' && r.voucherId === v.id);
        add(row ? `reward:${row.key}` : 'rewards', msg);
      }
      continue;
    }
    const quoted = /^(?:Stock for )?"([^"]+)"/.exec(msg)?.[1];
    if (quoted && /won|Stock for/.test(msg)) {
      const row = f.rewards.find((r) => r.label.trim() === quoted);
      add(row ? `reward:${row.key}` : 'rewards', msg);
      continue;
    }
    if (/slug/i.test(msg)) add('slug', msg);
    else if (/end time|end date/i.test(msg)) add('endsAt', msg);
    else if (/button link/i.test(msg)) add('ctaHref', msg);
    else if (/voucher to collect/i.test(msg)) add('voucherId', msg);
    else if (/flash sale/i.test(msg)) add('flashSaleId', msg);
    else if (/product/i.test(msg)) add('products', msg);
    else if (/spin wheel|daily game/i.test(msg)) add('game', msg);
    else if (/reward|coins/i.test(msg)) add('rewards', msg);
    else if (/Links start with/i.test(msg)) add('ticker', msg);
    else add('form', msg);
  }
  return out;
}
