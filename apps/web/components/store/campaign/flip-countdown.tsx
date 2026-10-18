'use client';

import { bn } from '@/lib/format';

const UNITS = ['দিন', 'ঘণ্টা', 'মিনিট', 'সেকেন্ড'] as const;

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return [Math.floor(s / 86400), Math.floor((s % 86400) / 3600), Math.floor((s % 3600) / 60), s % 60];
}

/**
 * দিন : ঘণ্টা : মিনিট : সেকেন্ড in Bangla digits. Each digit that changes flips in (CSS, off with reduced motion).
 * `now` is null until the server clock is known; the tiles keep their size so nothing moves.
 */
export function FlipCountdown({
  label,
  target,
  now,
  tileBg,
  tileInk,
  ink,
}: {
  label: string;
  target: number;
  now: number | null;
  tileBg: string;
  tileInk: string;
  ink: string;
}) {
  const values = now === null ? null : parts(target - now);
  // Screen readers get one label per minute, not a new number every second.
  const minuteLabel =
    values === null ? undefined : `${label} ${bn(values[0])} দিন ${bn(values[1])} ঘণ্টা ${bn(values[2])} মিনিট`;
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[13px] font-semibold sm:text-sm" style={{ color: ink }}>
        {label}
      </p>
      <div role="timer" aria-label={minuteLabel} className="flex items-start gap-1.5 sm:gap-2">
        {UNITS.map((unit, i) => {
          const v = values?.[i] ?? 0;
          const digits = values === null ? ['–', '–'] : bn(String(v).padStart(2, '0')).split('');
          return (
            <div key={unit} className="flex flex-col items-center" aria-hidden>
              <div className="flex gap-0.5">
                {digits.map((d, j) => (
                  <span
                    key={j}
                    className="cmp-digit relative grid h-9 w-7 place-items-center overflow-hidden rounded-[5px] text-xl font-bold tabular-nums sm:h-11 sm:w-8 sm:text-2xl"
                    style={{ background: tileBg, color: tileInk }}
                  >
                    {/* A new key per value remounts the digit, which plays the flip once. */}
                    <span key={`${d}`} className="cmp-flip">
                      {d}
                    </span>
                    <span className="absolute inset-x-0 top-1/2 h-px bg-black/25" />
                  </span>
                ))}
              </div>
              <span className="mt-1 text-[11px] font-medium sm:text-xs" style={{ color: ink }}>
                {unit}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
