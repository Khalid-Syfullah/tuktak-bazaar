'use client';

import { Monitor, Smartphone } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelTitle } from '@/components/admin/catalog/utils';
import { CampaignBlock } from '@/components/store/campaign/campaign-block';
import { OfferStrip } from '@/components/store/campaign/offer-strip';
import { clsx, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import type { CurrentCampaign } from '@/lib/campaign';
import { dateTime } from '@/lib/format';
import { errorMessage } from '@/components/admin/catalog/utils';
import { PreviewFrame } from './preview-frame';
import type { CampaignBody } from './types';

type Moment = 'teaser' | 'live' | 'last';
type Device = 'phone' | 'desktop';

const HOUR = 3_600_000;
const PHONE_WIDTH = 390;

function previewAt(moment: Moment, body: CampaignBody): Date {
  const start = Date.parse(body.startsAt);
  const end = Date.parse(body.endsAt);
  if (moment === 'teaser') return new Date(start - (body.teaserHours > 0 ? (body.teaserHours / 2) * HOUR : HOUR));
  if (moment === 'last') return new Date(end - 10_000);
  return new Date(start + 60_000);
}

function teaserLabel(hours: number) {
  if (hours <= 0) return 'Before start (1 h)';
  const half = hours / 2;
  return `Teaser (${Number.isInteger(half) ? half : half.toFixed(1)} h before)`;
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: React.ReactNode; title?: string }[]; onChange: (v: T) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid w-full auto-cols-fr grid-flow-col rounded-md border border-line bg-white p-0.5 sm:inline-flex sm:w-auto"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={clsx(
            'inline-flex min-h-8 items-center justify-center gap-1.5 rounded px-2 py-1 text-center text-sm leading-tight font-semibold sm:px-3 sm:whitespace-nowrap',
            value === o.value ? 'bg-padma text-white' : 'text-ink-soft hover:bg-black/5 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Asks the API what the storefront would show for the unsaved form at a chosen moment, then renders the real
 * storefront components in a phone- or desktop-width frame. Debounced; nothing is saved.
 */
export function CampaignPreview({ id, body, missing, teaserHours }: { id?: string; body: CampaignBody | null; missing?: string; teaserHours: number }) {
  const [moment, setMoment] = useState<Moment>('live');
  const [device, setDevice] = useState<Device>('desktop');
  const [result, setResult] = useState<CurrentCampaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const at = useMemo(() => (body ? previewAt(moment, body) : null), [body, moment]);
  // Re-request only when what we would send changes.
  const request = useMemo(() => (body && at ? JSON.stringify({ ...body, ...(id ? { id } : {}), at: at.toISOString() }) : null), [body, at, id]);

  useEffect(() => {
    if (!request) return;
    const n = ++seq.current;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api<CurrentCampaign>('/admin/campaigns/preview', {
          method: 'POST',
          body: request,
          headers: { 'content-type': 'application/json' },
          signal: controller.signal,
        });
        if (n !== seq.current) return;
        setResult(res);
        setError(null);
      } catch (e) {
        if (controller.signal.aborted || n !== seq.current) return;
        setError(errorMessage(e));
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [request]);

  return (
    <Panel className="mt-5">
      <div id="preview" className="scroll-mt-20" />
      <PanelTitle
        title="Live preview"
        description="The home page as shoppers would see it at the chosen moment, using your unsaved changes. Nothing is saved."
        actions={
          <Segmented<Device>
            label="Preview size"
            value={device}
            onChange={setDevice}
            options={[
              {
                value: 'phone',
                label: (
                  <>
                    <Smartphone className="size-4" aria-hidden /> Phone
                  </>
                ),
                title: `${PHONE_WIDTH} px wide`,
              },
              {
                value: 'desktop',
                label: (
                  <>
                    <Monitor className="size-4" aria-hidden /> Desktop
                  </>
                ),
                title: 'Full width',
              },
            ]}
          />
        }
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3">
        <Segmented<Moment>
          label="Preview moment"
          value={moment}
          onChange={setMoment}
          options={[
            {
              value: 'teaser',
              label: teaserLabel(teaserHours),
              title: teaserHours > 0 ? 'Halfway through the teaser countdown' : 'No teaser is set, so the store shows nothing before the start. This shows what a teaser would look like.',
            },
            { value: 'live', label: 'Live (start + 1 min)' },
            { value: 'last', label: 'Last 10 seconds' },
          ]}
        />
        <p className="flex items-center gap-2 text-sm text-ink-soft" aria-live="polite">
          {at && <span>Store clock: {dateTime(at)} (Dhaka)</span>}
          {loading && <Spinner className="size-4" />}
        </p>
      </div>
      {moment === 'teaser' && teaserHours <= 0 && body && (
        <p className="border-b border-line bg-marigold-tint px-4 py-2 text-sm text-marigold-dark">Teaser hours is 0, so the store shows nothing before the start. Set teaser hours to show a countdown banner.</p>
      )}
      <div className="bg-paper p-3 sm:p-4">
        {!body ? (
          <p className="py-10 text-center text-sm text-ink-soft">{missing ?? 'Fill in the campaign to see a preview.'}</p>
        ) : error ? (
          <div className="rounded-[6px] border border-sindoor/30 bg-sindoor-tint px-4 py-3 text-sm text-sindoor" role="alert">
            <p className="font-semibold">The preview could not be built</p>
            <p>{error}</p>
          </div>
        ) : !result ? (
          <p className="flex items-center justify-center gap-2 py-10 text-sm text-ink-soft">
            <Spinner className="size-4" /> Building the preview…
          </p>
        ) : (
          <div className={clsx('mx-auto overflow-hidden bg-paper', device === 'phone' ? 'rounded-[14px] border border-line shadow-sm' : 'rounded-[6px] border border-line')} style={{ width: device === 'phone' ? PHONE_WIDTH : '100%', maxWidth: '100%' }}>
            <PreviewFrame key={device} width={device === 'phone' ? PHONE_WIDTH : '100%'} title={`Store preview, ${device === 'phone' ? 'phone' : 'desktop'} width`}>
              {result.campaign ? (
                <>
                  <OfferStrip data={result} preview />
                  <div className="mx-auto max-w-[1240px] px-3 py-4 sm:px-4 sm:py-5">
                    <CampaignBlock data={result} preview />
                  </div>
                </>
              ) : (
                <p className="px-4 py-10 text-center text-sm text-ink-soft">The store would show no campaign at this moment.</p>
              )}
            </PreviewFrame>
          </div>
        )}
      </div>
    </Panel>
  );
}
