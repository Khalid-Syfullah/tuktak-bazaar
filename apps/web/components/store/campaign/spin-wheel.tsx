'use client';

import { useEffect, useRef, useState } from 'react';
import type { CampaignReward, CampaignTheme } from '@/lib/campaign';
import { THEMES } from './themes';

const R = 120;

/**
 * One segment per reward, in the admin's order, with a pointer at the top. After the server answers,
 * the wheel eases out over about 4 seconds onto the reward it returned. Reduced motion: no spin, the
 * winning segment is highlighted.
 */
export function SpinWheel({
  rewards,
  theme,
  winIndex,
  animate,
  reduced,
}: {
  rewards: CampaignReward[];
  theme: CampaignTheme;
  winIndex: number;
  /** Spin onto the result (just played). Otherwise rest on it (played earlier today). */
  animate: boolean;
  reduced: boolean;
}) {
  const t = THEMES[theme];
  const n = Math.max(rewards.length, 1);
  const seg = 360 / n;
  const [angle, setAngle] = useState(0);
  const landed = useRef(false);
  // A random point inside the segment, so it doesn't always stop dead centre.
  const jitter = useRef(0);

  useEffect(() => {
    if (winIndex < 0 || landed.current) return;
    landed.current = true;
    jitter.current = (Math.random() - 0.5) * seg * 0.6;
    const target = 360 - (winIndex * seg + seg / 2) + jitter.current;
    setAngle((a) => (reduced || !animate ? target : a - (a % 360) + 360 * 6 + target));
  }, [winIndex, seg, reduced, animate]);

  const colors = [
    [t.stripBg, t.stripInk],
    [t.badgeBg, t.badgeInk],
  ];
  const fontSize = n > 8 ? 11 : n > 6 ? 12.5 : 14;

  return (
    <div className="relative size-[230px] sm:size-[250px]" aria-hidden>
      {/* Pointer */}
      <svg viewBox="0 0 30 34" className="absolute left-1/2 top-[-6px] z-10 h-[30px] w-[26px] -translate-x-1/2 drop-shadow">
        <path d="M15 34 L2 6 Q15 -4 28 6 Z" fill="#17212b" />
        <circle cx="15" cy="9" r="4" fill="#ffffff" />
      </svg>
      <svg
        viewBox={`${-R - 6} ${-R - 6} ${2 * R + 12} ${2 * R + 12}`}
        className="size-full"
        style={{
          transform: `rotate(${angle}deg)`,
          transition: reduced || !animate ? 'none' : 'transform 4.2s cubic-bezier(0.15, 0.7, 0.1, 1)',
        }}
      >
        <circle r={R + 5} fill="#17212b" />
        {rewards.map((r, i) => {
          const a0 = ((i * seg - 90) * Math.PI) / 180;
          const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
          const [fill, ink] = colors[i % 2];
          const mid = i * seg + seg / 2;
          const words = r.label.split(' ');
          const lines = r.label.length > 9 && words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : [r.label];
          return (
            <g key={r.id}>
              <path
                d={`M0 0 L${R * Math.cos(a0)} ${R * Math.sin(a0)} A${R} ${R} 0 ${seg > 180 ? 1 : 0} 1 ${R * Math.cos(a1)} ${R * Math.sin(a1)} Z`}
                fill={fill}
                stroke={winIndex === i && (reduced || !animate) ? '#f2a900' : '#17212b'}
                strokeWidth={winIndex === i && (reduced || !animate) ? 5 : 1.5}
              />
              <g transform={`rotate(${mid}) translate(0 ${-R * 0.62}) rotate(${mid > 90 && mid < 270 ? 180 : 0})`}>
                <text textAnchor="middle" fontSize={fontSize} fontWeight={700} fill={ink} style={{ fontFamily: 'var(--font-sans)' }}>
                  {lines.map((l, j) => (
                    <tspan key={j} x="0" dy={j === 0 ? (lines.length > 1 ? -fontSize * 0.35 : fontSize * 0.35) : fontSize * 1.1}>
                      {l}
                    </tspan>
                  ))}
                </text>
              </g>
            </g>
          );
        })}
        <circle r="18" fill="#ffffff" stroke="#17212b" strokeWidth="3" />
      </svg>
    </div>
  );
}
