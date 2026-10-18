'use client';

import { Gift, Info, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/providers';
import { ApiError, post } from '@/lib/api';
import type { CampaignView, RewardResult } from '@/lib/campaign';
import { bn } from '@/lib/format';
import { confettiBurst } from './confetti';
import { MysteryBox } from './mystery-box';
import { SpinWheel } from './spin-wheel';
import { THEMES } from './themes';
import { useCampaignMe, useReducedMotion } from './use-campaign';

type Me = ReturnType<typeof useCampaignMe>;
export type GamePhase = 'idle' | 'playing' | 'revealing' | 'done';

const REVEAL_MS = { MYSTERY_BOX: 1000, SPIN_WHEEL: 4300 } as const;

/**
 * "আজকের সারপ্রাইজ": one play per day. The server decides the reward first; the box or wheel only reveals it.
 */
export function DailyGame({ c, preview, me }: { c: CampaignView; preview: boolean; me: Me }) {
  const game = c.game!;
  const t = THEMES[c.theme];
  const toast = useToast();
  const reduced = useReducedMotion();
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [phase, setPhase] = useState<GamePhase>('idle');
  const [result, setResult] = useState<RewardResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // The game is remounted at Dhaka midnight (and for another account); a play still finishing then must not
  // write its result into the new day's state.
  const alive = useRef(true);
  const reveal = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(reveal.current);
    };
  }, []);

  const played = me.state.status === 'in' && me.state.me.playedToday;
  const shown: RewardResult | null = result ?? (me.state.status === 'in' ? me.state.me.todayReward : null);
  const finished = phase === 'done' || (played && phase === 'idle');

  const play = async () => {
    if (preview || phase !== 'idle') return;
    setPhase('playing');
    setMessage(null);
    try {
      const { reward } = await post<{ reward: RewardResult }>(`/campaigns/${c.id}/play`);
      if (!alive.current) return;
      setResult(reward);
      setPhase('revealing');
      reveal.current = setTimeout(
        () => {
          setPhase('done');
          me.patch((m) => ({ ...m, playedToday: true, todayReward: reward }));
          if (reward.kind !== 'NONE' && !reduced && canvas.current) confettiBurst(canvas.current, t.confetti, { x: 0.5, y: 0.4 });
        },
        reduced ? 0 : REVEAL_MS[game.style],
      );
    } catch (err) {
      setPhase('idle');
      if (err instanceof ApiError && err.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent('/#campaign')}`;
        return;
      }
      if (err instanceof ApiError && err.status === 409) {
        setMessage(err.message);
        void me.refresh();
        return;
      }
      toast(err instanceof ApiError && err.status < 500 ? err.message : 'এখন খেলা যাচ্ছে না। একটু পরে আবার চেষ্টা করুন।', 'error');
    }
  };

  const winIndex = shown ? game.rewards.findIndex((r) => r.id === shown.id) : -1;

  return (
    <div ref={card} className="relative overflow-hidden rounded-[var(--radius-card)] border border-line bg-white p-4">
      <canvas ref={canvas} className="pointer-events-none absolute inset-0 size-full" aria-hidden />
      <h3 className="flex items-center gap-1.5 text-lg font-bold text-ink">
        <Gift className="size-5 text-sindoor" aria-hidden /> আজকের সারপ্রাইজ
      </h3>
      <p className="text-[13px] text-ink-soft">প্রতিদিন একবার খেলুন — জিতুন ভাউচার ও কয়েন</p>

      <div className="my-3 grid place-items-center">
        {game.style === 'SPIN_WHEEL' ? (
          <SpinWheel rewards={game.rewards} theme={c.theme} winIndex={phase === 'revealing' || finished ? winIndex : -1} animate={phase === 'revealing' || phase === 'done'} reduced={reduced} />
        ) : (
          <MysteryBox theme={c.theme} phase={finished ? 'done' : phase} label={shown?.label ?? null} win={!!shown && shown.kind !== 'NONE'} />
        )}
      </div>

      <div className="min-h-[88px] text-center" aria-live="polite">
        {finished && shown ? (
          <Outcome reward={shown} />
        ) : preview ? (
          <p className="rounded-md bg-paper px-3 py-2.5 text-[13px] text-ink-soft">প্রিভিউ — এখানে খেলা বন্ধ</p>
        ) : me.state.status === 'out' ? (
          <Link
            href={`/login?next=${encodeURIComponent('/#campaign')}`}
            className="inline-flex h-11 w-full items-center justify-center rounded-md bg-padma px-4 text-[15px] font-bold text-white hover:bg-padma-dark"
          >
            লগ ইন করে খেলুন
          </Link>
        ) : (
          <button
            type="button"
            onClick={play}
            disabled={me.state.status === 'loading' || phase !== 'idle'}
            className="cmp-sweep relative inline-flex h-11 w-full items-center justify-center overflow-hidden rounded-md bg-sindoor px-4 text-[15px] font-bold text-white hover:brightness-95 disabled:opacity-70"
          >
            {phase === 'playing' || phase === 'revealing'
              ? game.style === 'SPIN_WHEEL'
                ? 'ঘুরছে…'
                : 'খোলা হচ্ছে…'
              : me.state.status === 'loading'
                ? 'অপেক্ষা করুন…'
                : game.style === 'SPIN_WHEEL'
                  ? 'ঘোরান'
                  : 'বাক্স খুলুন'}
          </button>
        )}
        {message && <p className="mt-2 text-[13px] font-semibold text-sindoor">{message}</p>}
      </div>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        className="mx-auto mt-2 flex items-center gap-1 rounded px-2 py-1 text-[13px] font-semibold text-padma hover:bg-padma-tint"
      >
        <Info className="size-3.5" aria-hidden /> অফারের শর্তাবলি ও জেতার সম্ভাবনা
      </button>

      <dialog
        ref={dialog}
        className="m-auto w-[min(92vw,420px)] rounded-lg p-0 backdrop:bg-black/50"
        onClick={(e) => e.target === dialog.current && dialog.current?.close()}
        aria-labelledby="cmp-terms-title"
      >
        <div className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h4 id="cmp-terms-title" className="text-lg font-bold text-ink">
              অফারের শর্তাবলি
            </h4>
            <button type="button" onClick={() => dialog.current?.close()} className="rounded p-1 text-ink-soft hover:bg-paper" aria-label="বন্ধ করুন">
              <X className="size-5" />
            </button>
          </div>
          <table className="w-full text-[14px]">
            <caption className="mb-1 text-left text-[13px] font-semibold text-ink-soft">জেতার সম্ভাবনা</caption>
            <tbody>
              {game.rewards.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="py-1.5 text-ink">{r.label}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums text-ink">{r.odds > 0 ? `${bn(r.odds)}%` : 'শেষ'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-ink-soft">
            <li>প্রতিদিন একবার খেলা যাবে। রাত ১২টায় নতুন দিন শুরু হয়।</li>
            <li>খেলতে কোনো কেনাকাটা লাগবে না।</li>
            <li>পুরস্কার স্টক থাকা পর্যন্ত।</li>
            <li>যে ভাউচার আগে থেকেই আপনার আছে, সেটি আবার জেতা যায় না।</li>
            <li>ভাউচারের নিজস্ব শর্ত (সর্বনিম্ন অর্ডার ও মেয়াদ) প্রযোজ্য।</li>
          </ul>
        </div>
      </dialog>
    </div>
  );
}

function Outcome({ reward }: { reward: RewardResult }) {
  if (reward.kind === 'NONE') {
    return (
      <div className="rounded-md bg-paper px-3 py-3">
        <p className="text-[15px] font-semibold text-ink">আবার চেষ্টা করুন — কাল আবার আসুন</p>
        <p className="mt-0.5 text-[13px] text-ink-soft">কাল আবার খেলুন</p>
      </div>
    );
  }
  return (
    <div className="cmp-rise rounded-md bg-marigold-tint px-3 py-3">
      <p className="text-[13px] text-ink-soft">আপনি জিতেছেন</p>
      <p className="text-xl font-bold text-sindoor">{reward.label}</p>
      {reward.voucherCode && <p className="text-[12px] text-ink-soft">কোড: {reward.voucherCode}</p>}
      <div className="mt-2 flex items-center justify-center gap-3">
        <Link href={reward.kind === 'VOUCHER' ? '/account/vouchers' : '/account/coins'} className="text-[14px] font-bold text-padma hover:underline">
          {reward.kind === 'VOUCHER' ? 'ভাউচার দেখুন' : 'কয়েন দেখুন'}
        </Link>
        <span className="text-[12px] text-ink-faint">কাল আবার খেলুন</span>
      </div>
    </div>
  );
}
