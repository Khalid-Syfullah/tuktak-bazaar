'use client';

import clsx from 'clsx';
import { Check, Ticket } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/providers';
import { ApiError, post } from '@/lib/api';
import type { CampaignView } from '@/lib/campaign';
import { tkBn } from '@/lib/format';
import { confettiBurst } from './confetti';
import { FlipCountdown } from './flip-countdown';
import { star, ThemePattern, THEMES } from './themes';
import { useCampaignMe, useReducedMotion } from './use-campaign';

type Me = ReturnType<typeof useCampaignMe>;

export function CampaignBanner({
  c,
  phase,
  now,
  preview,
  me,
}: {
  c: CampaignView;
  phase: 'TEASER' | 'LIVE';
  now: number | null;
  preview: boolean;
  me: Me;
}) {
  const t = THEMES[c.theme];
  const root = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotion();

  // One confetti burst per browser session, when the live banner first comes into view.
  useEffect(() => {
    if (!c.confetti || phase !== 'LIVE' || reduced || !root.current || !canvas.current) return;
    const key = `cmp-confetti-${c.id}`;
    try {
      if (!preview && sessionStorage.getItem(key)) return;
    } catch {
      /* storage blocked: just play it */
    }
    let stop: (() => void) | undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || !canvas.current) return;
        io.disconnect();
        stop = confettiBurst(canvas.current, t.confetti);
        try {
          if (!preview) sessionStorage.setItem(key, '1');
        } catch {
          /* ignore */
        }
      },
      { threshold: 0.5 },
    );
    io.observe(root.current);
    return () => {
      io.disconnect();
      stop?.();
    };
  }, [c.id, c.confetti, phase, reduced, preview, t.confetti]);

  const target = Date.parse(phase === 'TEASER' ? c.startsAt : c.endsAt);

  return (
    <div
      ref={root}
      className="relative isolate overflow-hidden rounded-[var(--radius-card)] shadow-sm sm:min-h-[300px] lg:aspect-[16/5] lg:min-h-0"
      style={{ background: t.bg, color: t.ink }}
    >
      <ThemePattern theme={c.theme} />
      {c.heroImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={c.heroImageUrl}
          alt=""
          width={600}
          height={400}
          className="cmp-float pointer-events-none absolute bottom-[4%] right-[2%] hidden h-[82%] w-auto max-w-[44%] object-contain drop-shadow-[0_18px_24px_rgba(0,0,0,0.25)] sm:block"
        />
      )}
      {c.badge && <Starburst text={c.badge} bg={t.badgeBg} ink={t.badgeInk} />}
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" aria-hidden />

      <div
        className={clsx(
          'relative flex flex-col gap-3 p-4 pr-24 sm:max-w-[60%] sm:gap-4 sm:p-7 sm:pr-7 lg:p-9',
          // Room for the alpona borders top and bottom
          c.theme === 'BOISHAKH' && 'py-10 sm:py-11 lg:py-12',
        )}
      >
        <div>
          <h2 className="cmp-drop font-brand text-[34px] leading-[1.15] drop-shadow-[0_2px_0_rgba(0,0,0,0.12)] sm:text-[46px] lg:text-[60px]">
            {c.title}
          </h2>
          {c.tagline && (
            <p className="mt-1 text-[15px] font-semibold drop-shadow-[0_1px_1px_rgba(0,0,0,0.18)] sm:text-lg" style={{ color: t.soft }}>
              {c.tagline}
            </p>
          )}
        </div>

        <FlipCountdown
          label={phase === 'TEASER' ? 'শুরু হতে বাকি' : 'শেষ হতে বাকি'}
          target={target}
          now={now}
          tileBg={t.tileBg}
          tileInk={t.tileInk}
          ink={t.soft}
        />

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={c.cta.href}
            className="cmp-sweep cmp-pulse relative inline-flex h-11 items-center overflow-hidden rounded-md px-5 text-[15px] font-bold shadow-sm"
            style={{ background: t.ctaBg, color: t.ctaInk }}
            tabIndex={preview ? -1 : undefined}
          >
            {c.cta.label}
          </Link>
          {c.voucher && <VoucherButton c={c} preview={preview} me={me} ink={t.ink} />}
        </div>
      </div>
    </div>
  );
}

/** A wobbling starburst with the best discount. Top right on phones, between text and art on wider screens. */
function Starburst({ text, bg, ink }: { text: string; bg: string; ink: string }) {
  const [first, ...rest] = text.startsWith('সর্বোচ্চ ') ? ['সর্বোচ্চ', text.slice('সর্বোচ্চ '.length)] : [text];
  return (
    <div
      className="cmp-wobble absolute right-3 top-3 z-10 grid size-[84px] place-items-center sm:right-auto sm:left-[54%] sm:top-[9%] sm:size-[112px] lg:left-[52%] lg:size-[128px]"
      aria-hidden
    >
      <svg viewBox="-50 -50 100 100" className="absolute inset-0 size-full drop-shadow-[0_6px_10px_rgba(0,0,0,0.22)]">
        <path d={star(49, 40, 16)} fill={bg} />
      </svg>
      <span className="relative px-2 text-center font-bold leading-tight" style={{ color: ink }}>
        {rest.length ? (
          <>
            <span className="block text-[11px] sm:text-[13px]">{first}</span>
            <span className="block text-[17px] sm:text-[22px] lg:text-[25px]">{rest[0]}</span>
          </>
        ) : (
          <span className="block text-[13px] sm:text-[16px]">{first}</span>
        )}
      </span>
    </div>
  );
}

function VoucherButton({ c, preview, me, ink }: { c: CampaignView; preview: boolean; me: Me; ink: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const v = c.voucher!;
  const collected = me.state.status === 'in' && me.state.me.voucherCollected;

  const collect = async () => {
    if (preview || collected || busy) return;
    if (me.state.status === 'out') {
      window.location.href = `/login?next=${encodeURIComponent('/#campaign')}`;
      return;
    }
    setBusy(true);
    try {
      await post(`/vouchers/${v.id}/collect`);
      me.patch((m) => ({ ...m, voucherCollected: true }));
      toast('ভাউচার সংগ্রহ করা হয়েছে। চেকআউটে ব্যবহার করুন।');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent('/#campaign')}`;
        return;
      }
      toast('ভাউচারটি এখন নেওয়া যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={collect}
      disabled={collected || busy}
      aria-disabled={preview || undefined}
      className="inline-flex h-11 items-center gap-2 rounded-md border-2 px-3.5 text-left text-[14px] font-bold backdrop-blur-[2px] transition-colors disabled:cursor-default"
      style={{ borderColor: ink, color: ink, background: 'rgba(255,255,255,0.08)' }}
    >
      {collected ? <Check className="size-4 shrink-0" aria-hidden /> : <Ticket className="size-4 shrink-0" aria-hidden />}
      <span className="leading-tight">
        {collected ? 'সংগ্রহ করা হয়েছে' : 'ভাউচার সংগ্রহ করুন'}
        <span className="block text-[11px] font-semibold opacity-90">
          {v.label}
          {v.minSpend > 0 ? ` · ${tkBn(v.minSpend)}+ অর্ডারে` : ''}
        </span>
      </span>
    </button>
  );
}
