import clsx from 'clsx';
import type { CampaignTheme } from '@/lib/campaign';
import type { GamePhase } from './daily-game';
import { THEMES } from './themes';

/**
 * A gift box in the theme colours: it bobs while waiting, shakes while the server decides, then the lid
 * swings open and the prize card rises out. Everything stays inside its own 170 × 216 box.
 */
export function MysteryBox({ theme, phase, label, win }: { theme: CampaignTheme; phase: GamePhase; label: string | null; win: boolean }) {
  const t = THEMES[theme];
  const box = theme === 'BOISHAKH' || theme === 'WINTER' ? t.ctaBg : t.stripBg;
  const ribbon = t.badgeBg === box ? '#f2a900' : t.badgeBg;
  const open = phase === 'revealing' || phase === 'done';
  return (
    <div className={clsx('relative h-[216px] w-[170px]', phase === 'idle' && 'cmp-bob', phase === 'playing' && 'cmp-shake')} aria-hidden>
      {open && win && (
        <div className="cmp-glow absolute left-1/2 top-0 size-[170px] -translate-x-1/2 rounded-full" style={{ background: `radial-gradient(circle, ${ribbon}55, transparent 65%)` }} />
      )}
      {/* The prize card waits inside the box and rises out when it opens. */}
      <div
        className={clsx(
          'absolute left-1/2 top-[112px] grid h-[64px] w-[128px] -translate-x-1/2 place-items-center rounded-md border-2 bg-white px-2 text-center text-[15px] font-bold leading-tight shadow-md transition-all duration-500',
          open ? 'z-30 -translate-y-[104px] opacity-100' : 'z-0 opacity-0',
        )}
        style={{ borderColor: ribbon, color: win ? '#d7263d' : '#5b6672', transitionDelay: open ? '200ms' : '0ms' }}
      >
        {label}
      </div>
      {/* Box body */}
      <div className="absolute bottom-0 left-[14px] z-10 h-[92px] w-[142px] rounded-b-md shadow-lg" style={{ background: box }}>
        <div className="absolute inset-y-0 left-1/2 w-[18px] -translate-x-1/2" style={{ background: ribbon }} />
      </div>
      {/* Lid with bow, hinged at its left end */}
      <div
        className="absolute left-[6px] top-[96px] z-20 h-[28px] w-[158px] origin-bottom-left rounded-md shadow-md transition-transform duration-500 ease-out"
        style={{ background: box, transform: open ? 'translateY(-4px) rotate(-32deg)' : undefined }}
      >
        <div className="absolute inset-y-0 left-1/2 w-[18px] -translate-x-1/2" style={{ background: ribbon }} />
        <svg viewBox="0 0 80 40" className="absolute -top-[30px] left-1/2 h-[34px] w-[68px] -translate-x-1/2">
          <path d="M40 34 C20 6 4 10 8 24 C11 34 30 34 40 34Z" fill={ribbon} />
          <path d="M40 34 C60 6 76 10 72 24 C69 34 50 34 40 34Z" fill={ribbon} />
          <circle cx="40" cy="32" r="6" fill={ribbon} stroke="rgba(0,0,0,0.15)" />
        </svg>
      </div>
    </div>
  );
}
