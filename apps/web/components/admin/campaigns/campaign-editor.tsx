'use client';

import { ChevronLeft, CircleAlert, CircleCheck, Copy, Eye } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DeleteButton, Toggle } from '@/components/admin/catalog/common';
import { errorMessage, fromDhakaInput, Panel, PanelTitle } from '@/components/admin/catalog/utils';
import { useToast } from '@/components/providers';
import { Button, clsx, Field, Input, Modal, Select } from '@/components/ui';
import { del, patch, post } from '@/lib/api';
import { THEME_LABEL, type CampaignTheme, type GameStyle } from '@/lib/campaign';
import { date, dateTime } from '@/lib/format';
import { ArtField } from './art-field';
import { CampaignStatusBadge } from './bits';
import { CampaignPreview } from './campaign-preview';
import { type CampaignForm, emptyForm, type Errors, errorsFromApi, formFromDetail, newReward, previewBody, suggestSlug, toBody, validate } from './form';
import { ProductPicker } from './product-picker';
import { RewardEditor } from './reward-editor';
import { TickerEditor } from './ticker-editor';
import { type CampaignDetail, type FlashSaleOption, REWARD_RULE, type VoucherOption } from './types';

const HOUR = 3_600_000;

/** Which error keys a change to a form field clears. */
function clearedBy(key: keyof CampaignForm): (k: string) => boolean {
  switch (key) {
    case 'startsAt':
    case 'endsAt':
      return (k) => k === 'startsAt' || k === 'endsAt' || k === 'voucherId' || k === 'flashSaleId';
    case 'products':
      return (k) => k === 'products';
    case 'ticker':
      return (k) => k === 'ticker' || k.startsWith('ticker:');
    case 'rewards':
      return (k) => k === 'rewards' || k === 'game' || k.startsWith('reward:');
    case 'gameEnabled':
    case 'gameStyle':
      return (k) => k === 'game';
    case 'slugTouched':
      return () => false;
    default:
      return (k) => k === key;
  }
}

function overlaps(a: { startsAt: string; endsAt: string }, start: string | null, end: string | null) {
  if (!start || !end) return true;
  return Date.parse(a.startsAt) < Date.parse(end) && Date.parse(a.endsAt) > Date.parse(start);
}

export function CampaignEditor({
  campaign,
  vouchers,
  flashSales,
  plays,
  stats,
}: {
  campaign?: CampaignDetail;
  vouchers: VoucherOption[];
  flashSales: FlashSaleOption[];
  /** Known play count for the delete message; undefined when unknown. */
  plays?: number;
  /** Results panel, rendered under the preview on the edit page. */
  stats?: React.ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const [initial] = useState(() => (campaign ? formFromDetail(campaign) : emptyForm()));
  const [form, setForm] = useState<CampaignForm>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(initial), [form, initial]);

  function update<K extends keyof CampaignForm>(key: K, value: CampaignForm[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (!next.slugTouched && (key === 'title' || key === 'theme' || key === 'startsAt')) next.slug = suggestSlug(next);
      return next;
    });
    const hit = clearedBy(key);
    setErrors((e) => {
      const keys = Object.keys(e).filter(hit);
      if (!keys.length) return e;
      const rest = { ...e };
      keys.forEach((k) => delete rest[k]);
      return rest;
    });
  }

  const preview = useMemo(() => previewBody(form), [form]);
  const startIso = fromDhakaInput(form.startsAt);
  const endIso = fromDhakaInput(form.endsAt);
  const teaserFrom = startIso && /^\d+$/.test(form.teaserHours) ? new Date(Date.parse(startIso) - Number(form.teaserHours) * HOUR) : null;

  const collectible = vouchers.filter((v) => (v.isActive && v.isCollectible) || v.id === form.voucherId);
  const collectVoucher = vouchers.find((v) => v.id === form.voucherId);
  const flashSale = flashSales.find((s) => s.id === form.flashSaleId);
  const rule = REWARD_RULE[form.gameStyle];
  const ruleOk = form.rewards.length >= rule.min && form.rewards.length <= rule.max;

  function focusFirstError() {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = formRef.current?.querySelector<HTMLElement>('[data-error], [aria-invalid="true"]');
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }),
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast(Object.values(errs)[0], 'error');
      focusFirstError();
      return;
    }
    setSaving(true);
    try {
      const body = toBody(form);
      if (campaign) await patch(`/admin/campaigns/${campaign.id}`, body);
      else await post('/admin/campaigns', body);
      toast(campaign ? 'Campaign saved' : 'Campaign created');
      router.push('/admin/campaigns');
      router.refresh();
    } catch (err) {
      setErrors(errorsFromApi(err, form, vouchers));
      toast(errorMessage(err), 'error');
      setSaving(false);
      focusFirstError();
    }
  }

  async function duplicate() {
    if (!campaign) return;
    setDuplicating(true);
    try {
      const copy = await post<{ id: string }>(`/admin/campaigns/${campaign.id}/duplicate`);
      toast('Copy created. It is switched off until you turn it on.');
      router.push(`/admin/campaigns/${copy.id}`);
    } catch (err) {
      toast(errorMessage(err), 'error');
      setDuplicating(false);
    }
  }

  const err = (k: string) => errors[k];
  const saveLabel = campaign ? 'Save campaign' : 'Create campaign';

  return (
    <form ref={formRef} onSubmit={submit} noValidate>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link href="/admin/campaigns" className="inline-flex items-center gap-1 text-sm text-ink-soft hover:text-ink">
            <ChevronLeft className="size-4" aria-hidden />
            Campaigns
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold text-ink" lang={campaign ? 'bn' : undefined}>
              {campaign ? campaign.title : 'New campaign'}
            </h1>
            {campaign && <CampaignStatusBadge status={campaign.status} />}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a href="#preview" className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-[15px] font-semibold text-ink-soft hover:bg-black/5 hover:text-ink">
            <Eye className="size-4" aria-hidden />
            Preview
          </a>
          {campaign && (
            <>
              <Button type="button" variant="outline" loading={duplicating} onClick={() => (dirty ? setConfirmDuplicate(true) : duplicate())}>
                <Copy className="size-4" aria-hidden />
                Duplicate
              </Button>
              <DeleteButton
                size="md"
                title="Delete campaign"
                body={
                  plays && plays > 0 ? (
                    <>
                      <span lang="bn" className="font-semibold text-ink">
                        {campaign.title}
                      </span>{' '}
                      has {plays} game play{plays === 1 ? '' : 's'}, so it will be switched off instead of deleted. Its results stay available.
                    </>
                  ) : (
                    <>
                      Delete{' '}
                      <span lang="bn" className="font-semibold text-ink">
                        {campaign.title}
                      </span>
                      ? {plays === undefined ? 'If shoppers already played its game, it will be switched off instead.' : 'This cannot be undone.'}
                    </>
                  )
                }
                confirmLabel={plays && plays > 0 ? 'Switch off campaign' : 'Delete campaign'}
                onConfirm={async () => {
                  try {
                    const res = await del<{ ok: boolean; deactivated?: boolean }>(`/admin/campaigns/${campaign.id}`);
                    toast(res?.deactivated ? 'Shoppers already played this campaign, so it was switched off instead of deleted' : 'Campaign deleted');
                    router.push('/admin/campaigns');
                    router.refresh();
                  } catch (e) {
                    toast(errorMessage(e), 'error');
                    return true;
                  }
                }}
              />
            </>
          )}
          <Button type="submit" loading={saving} className="max-sm:hidden">
            {saveLabel}
          </Button>
        </div>
      </div>

      {errors.form && (
        <div data-error className="mb-5 flex gap-2 rounded-[6px] border border-sindoor/30 bg-sindoor-tint px-4 py-3 text-sm text-sindoor" role="alert">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{errors.form}</p>
        </div>
      )}

      {/* ───── Basics ───── */}
      <Panel>
        <PanelTitle title="Basics" description="Times are Bangladesh time. Title and tagline are shown to shoppers in Bangla." />
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <Field label="Title (Bangla)" error={err('title')} className="sm:col-span-2 lg:col-span-3">
            <Input lang="bn" value={form.title} maxLength={80} placeholder="টুকটাক মেগা সেল" aria-invalid={!!err('title') || undefined} onChange={(e) => update('title', e.target.value)} />
          </Field>
          <Field label="Tagline (Bangla, optional)" error={err('tagline')} className="sm:col-span-2 lg:col-span-3">
            <Input lang="bn" value={form.tagline} maxLength={140} placeholder="বছরের সবচেয়ে বড় ছাড়" onChange={(e) => update('tagline', e.target.value)} />
          </Field>
          <div className="sm:col-span-2 lg:col-span-2">
            <label htmlFor="campaign-slug" className="mb-1 block text-sm font-medium text-ink">
              Slug
            </label>
            <div className="flex gap-2">
              <Input
                id="campaign-slug"
                className="font-mono"
                value={form.slug}
                maxLength={60}
                placeholder="mega-sale-2026-11-11"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={!!err('slug') || undefined}
                aria-describedby="campaign-slug-help"
                onChange={(e) => {
                  update('slugTouched', true);
                  update('slug', e.target.value.toLowerCase().replace(/\s+/g, '-'));
                }}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  update('slugTouched', true);
                  update('slug', suggestSlug(form));
                }}
              >
                Suggest
              </Button>
            </div>
            <span id="campaign-slug-help" className={clsx('mt-1 block', err('slug') ? 'text-sm text-sindoor' : 'text-xs text-ink-soft')}>
              {err('slug') ?? 'Lowercase English letters, numbers and dashes. Bangla titles can’t be turned into a slug, so type one.'}
            </span>
          </div>
          <Field label="Starts (Dhaka time)" error={err('startsAt')} className="lg:col-span-2">
            <Input type="datetime-local" value={form.startsAt} aria-invalid={!!err('startsAt') || undefined} onChange={(e) => update('startsAt', e.target.value)} />
          </Field>
          <Field label="Ends (Dhaka time)" error={err('endsAt')} className="lg:col-span-2">
            <Input type="datetime-local" value={form.endsAt} aria-invalid={!!err('endsAt') || undefined} onChange={(e) => update('endsAt', e.target.value)} />
          </Field>
          <Field
            label="Teaser hours"
            error={err('teaserHours')}
            hint={`The banner shows 'শুরু হতে বাকি' this long before the start.${teaserFrom && Number(form.teaserHours) > 0 ? ` From ${dateTime(teaserFrom)}.` : ' 0 means no teaser.'}`}
            className="lg:col-span-2"
          >
            <Input type="number" inputMode="numeric" min={0} max={168} value={form.teaserHours} aria-invalid={!!err('teaserHours') || undefined} onChange={(e) => update('teaserHours', e.target.value)} />
          </Field>
          <Field label="Priority" error={err('priority')} hint="When campaigns overlap, the higher number is shown. -100 to 100." className="lg:col-span-2">
            <Input type="number" inputMode="numeric" min={-100} max={100} value={form.priority} aria-invalid={!!err('priority') || undefined} onChange={(e) => update('priority', e.target.value)} />
          </Field>
          <div className="self-center sm:col-span-2 lg:col-span-2 lg:pt-5">
            <Toggle label="Active" hint="Switched-off campaigns never show in the store." checked={form.isActive} onChange={(v) => update('isActive', v)} />
          </div>
        </div>
      </Panel>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* ───── Look ───── */}
        <Panel>
          <PanelTitle title="Look" description="Colours, pattern and countdown style come from the theme." />
          <div className="grid gap-4 p-4">
            <Field label="Theme" error={err('theme')}>
              <Select value={form.theme} onChange={(e) => update('theme', e.target.value as CampaignTheme)}>
                {(Object.keys(THEME_LABEL) as CampaignTheme[]).map((t) => (
                  <option key={t} value={t}>
                    {THEME_LABEL[t]}
                  </option>
                ))}
              </Select>
            </Field>
            <ArtField value={form.heroImageUrl} onChange={(v) => update('heroImageUrl', v)} />
            <Toggle label="Confetti" hint="A short confetti burst when the live banner first appears." checked={form.confetti} onChange={(v) => update('confetti', v)} />
          </div>
        </Panel>

        <div className="grid content-start gap-5">
          {/* ───── Call to action ───── */}
          <Panel>
            <PanelTitle title="Call to action" description="The main button on the banner." />
            <div className="grid gap-4 p-4">
              <Field label="Button label (Bangla)" error={err('ctaLabel')}>
                <Input lang="bn" value={form.ctaLabel} maxLength={30} placeholder="এখনই কিনুন" aria-invalid={!!err('ctaLabel') || undefined} onChange={(e) => update('ctaLabel', e.target.value)} />
              </Field>
              <Field label="Button link" error={err('ctaHref')} hint="A store path such as /flash-sale, or a full https:// link.">
                <Input value={form.ctaHref} maxLength={300} placeholder="/flash-sale" aria-invalid={!!err('ctaHref') || undefined} onChange={(e) => update('ctaHref', e.target.value)} />
              </Field>
            </div>
          </Panel>
          {/* ───── Voucher to collect ───── */}
          <Panel>
            <PanelTitle title="Voucher to collect" description="Shoppers can save it to their account straight from the banner." />
            <div className="p-4">
              <Field
                label="Voucher"
                error={err('voucherId')}
                hint={
                  collectVoucher
                    ? `${collectVoucher.code}: valid ${date(collectVoucher.startsAt)} to ${date(collectVoucher.endsAt)}.${overlaps(collectVoucher, startIso, endIso) ? '' : ' It isn’t valid during this campaign.'}${collectVoucher.isActive && collectVoucher.isCollectible ? '' : ' It is no longer active and collectible.'}`
                    : 'Only active, collectible vouchers are listed.'
                }
              >
                <Select value={form.voucherId} aria-invalid={!!err('voucherId') || undefined} onChange={(e) => update('voucherId', e.target.value)}>
                  <option value="">None</option>
                  {collectible.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.code}: {v.title} ({date(v.startsAt)} to {date(v.endsAt)})
                      {v.isActive && v.isCollectible ? (overlaps(v, startIso, endIso) ? '' : ' (not valid during this campaign)') : ' (not collectible now)'}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Panel>
        </div>
      </div>

      {/* ───── Deals ───── */}
      <Panel className="mt-5">
        <PanelTitle title="Deals" description="Cards under the banner while the campaign is live: flash-sale items first, then the products you pick." />
        <div className="border-b border-line p-4">
          <Field
            label="Flash sale (optional)"
            error={err('flashSaleId')}
            hint={
              flashSale
                ? `Runs ${dateTime(flashSale.startsAt)} to ${dateTime(flashSale.endsAt)}, ${flashSale.items.length} item${flashSale.items.length === 1 ? '' : 's'}${flashSale.isActive ? '' : ', switched off'}.${overlaps(flashSale, startIso, endIso) ? '' : ' It doesn’t overlap this campaign.'}`
                : 'Its items show first, best sellers first.'
            }
            className="max-w-xl"
          >
            <Select value={form.flashSaleId} aria-invalid={!!err('flashSaleId') || undefined} onChange={(e) => update('flashSaleId', e.target.value)}>
              <option value="">None</option>
              {flashSales.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({date(s.startsAt)} to {date(s.endsAt)}){s.isActive ? (overlaps(s, startIso, endIso) ? '' : ' (outside this campaign)') : ' (switched off)'}
                </option>
              ))}
            </Select>
          </Field>
          <p className="mt-2 text-sm text-ink-soft">Flash prices show only while that flash sale runs.</p>
        </div>
        <ProductPicker value={form.products} onChange={(rows) => update('products', rows)} error={err('products')} />
      </Panel>

      {/* ───── Offer strip ───── */}
      <Panel className="mt-5">
        <PanelTitle title="Offer strip" description="Short Bangla lines that scroll under the store header on every page while the campaign is live." />
        <TickerEditor value={form.ticker} onChange={(rows) => update('ticker', rows)} errors={errors} />
      </Panel>

      {/* ───── Daily game ───── */}
      <Panel className="mt-5">
        <PanelTitle title="Daily game" description="One play per shopper per day while the campaign is live. The server picks the prize by weight." />
        <div className="grid gap-4 border-b border-line p-4">
          <Toggle
            label="Daily game on"
            hint="Shoppers must be signed in to play."
            checked={form.gameEnabled}
            onChange={(v) => {
              update('gameEnabled', v);
              if (v && form.rewards.length === 0) {
                update('rewards', [newReward('COINS', { coins: '20', label: '২০ কয়েন', weight: '30' }), newReward('NONE', { weight: '40' })]);
              }
            }}
          />
          <fieldset className={clsx(!form.gameEnabled && 'opacity-60')}>
            <legend className="mb-1 text-sm font-medium text-ink">Style</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:max-w-2xl">
              {(
                [
                  ['MYSTERY_BOX', 'Mystery box', 'Shoppers open one of three boxes. Needs 2 to 10 rewards.'],
                  ['SPIN_WHEEL', 'Spin wheel', 'One slice per reward, in the order below. Needs 4 to 10 rewards.'],
                ] as [GameStyle, string, string][]
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className={clsx(
                    'flex cursor-pointer items-start gap-2.5 rounded-[6px] border p-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-marigold',
                    form.gameStyle === value ? 'border-padma bg-padma-tint/50' : 'border-line hover:border-ink-faint',
                  )}
                >
                  <input type="radio" name="gameStyle" className="mt-0.5 size-4 accent-padma" checked={form.gameStyle === value} onChange={() => update('gameStyle', value)} />
                  <span>
                    <span className="block text-sm font-semibold text-ink">{label}</span>
                    <span className="block text-xs text-ink-soft">{hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          <p
            data-error={err('game') ? true : undefined}
            className={clsx('flex items-center gap-1.5 text-sm', err('game') ? 'text-sindoor' : ruleOk ? 'text-padma-dark' : form.gameEnabled ? 'text-marigold-dark' : 'text-ink-soft')}
          >
            {ruleOk && !err('game') ? <CircleCheck className="size-4 shrink-0" aria-hidden /> : <CircleAlert className="size-4 shrink-0" aria-hidden />}
            {err('game') ??
              `${form.rewards.length} reward${form.rewards.length === 1 ? '' : 's'}. A spin wheel needs 4 to 10 rewards, a mystery box 2 to 10.`}
          </p>
        </div>
        <RewardEditor value={form.rewards} onChange={(rows) => update('rewards', rows)} vouchers={vouchers} errors={errors} window={{ start: startIso, end: endIso }} />
      </Panel>

      <CampaignPreview
        id={campaign?.id}
        body={'body' in preview ? preview.body : null}
        missing={'missing' in preview ? preview.missing : undefined}
        teaserHours={/^\d+$/.test(form.teaserHours) ? Math.min(168, Number(form.teaserHours)) : 0}
      />

      {stats}

      <div className="sticky bottom-0 z-10 -mx-4 mt-5 flex items-center justify-end gap-3 border-t border-line bg-white/95 px-4 py-3 sm:mx-0 sm:rounded-[6px] sm:border">
        <p className="mr-auto hidden text-sm text-ink-soft sm:block">
          {form.products.length} product{form.products.length === 1 ? '' : 's'}, {form.ticker.length} offer line{form.ticker.length === 1 ? '' : 's'}
          {form.gameEnabled ? `, ${form.rewards.length} reward${form.rewards.length === 1 ? '' : 's'}` : ', no game'}
          {dirty && <span className="ml-2 font-medium text-marigold-dark">Unsaved changes</span>}
        </p>
        {dirty && <p className="mr-auto text-sm font-medium text-marigold-dark sm:hidden">Unsaved</p>}
        <Link href="/admin/campaigns" className="inline-flex h-10 items-center rounded-md px-4 text-[15px] font-semibold text-ink-soft hover:bg-black/5 hover:text-ink">
          Cancel
        </Link>
        <Button type="submit" loading={saving}>
          {saveLabel}
        </Button>
      </div>

      {confirmDuplicate &&
        createPortal(
          <Modal open onClose={() => setConfirmDuplicate(false)} title="Duplicate campaign">
            <p className="text-[15px] text-ink-soft">You have unsaved changes. The copy is made from the last saved version, so save first if you want them in the copy.</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmDuplicate(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                loading={duplicating}
                onClick={async () => {
                  await duplicate();
                  setConfirmDuplicate(false);
                }}
              >
                Duplicate saved version
              </Button>
            </div>
          </Modal>,
          document.body,
        )}
    </form>
  );
}
