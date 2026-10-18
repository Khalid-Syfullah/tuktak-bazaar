import type { CampaignTheme } from '@/lib/campaign';

/** Colours for each festival theme. Every text/background pair meets WCAG AA. */
export interface ThemeStyle {
  /** Banner background */
  bg: string;
  /** Headline and body text on the banner */
  ink: string;
  soft: string;
  /** Primary button */
  ctaBg: string;
  ctaInk: string;
  /** Starburst badge */
  badgeBg: string;
  badgeInk: string;
  /** Countdown tiles */
  tileBg: string;
  tileInk: string;
  /** Offer strip under the header */
  stripBg: string;
  stripInk: string;
  /** Confetti colours */
  confetti: string[];
}

export const THEMES: Record<CampaignTheme, ThemeStyle> = {
  MEGA_SALE: {
    bg: 'linear-gradient(115deg, #b51a2e 0%, #d7263d 48%, #e24a22 82%, #f08a00 100%)',
    ink: '#ffffff',
    soft: '#ffffff',
    ctaBg: '#ffffff',
    ctaInk: '#b51a2e',
    badgeBg: '#053d2b',
    badgeInk: '#ffd25a',
    tileBg: 'rgba(23, 33, 43, 0.82)',
    tileInk: '#ffffff',
    stripBg: '#b51a2e',
    stripInk: '#fff4d6',
    confetti: ['#f2a900', '#ffffff', '#0b6e4f', '#ffd25a', '#fde8eb'],
  },
  PAYDAY: {
    bg: 'linear-gradient(120deg, #053d2b 0%, #0b6e4f 60%, #12855f 100%)',
    ink: '#ffffff',
    soft: '#d8efe5',
    ctaBg: '#f2a900',
    ctaInk: '#17212b',
    badgeBg: '#f2a900',
    badgeInk: '#17212b',
    tileBg: 'rgba(0, 0, 0, 0.45)',
    tileInk: '#ffffff',
    stripBg: '#053d2b',
    stripInk: '#ffe9a8',
    confetti: ['#f2a900', '#ffffff', '#7fd8b2', '#ffd25a'],
  },
  EID: {
    bg: 'linear-gradient(160deg, #0b1440 0%, #17266b 55%, #24398f 100%)',
    ink: '#ffffff',
    soft: '#dfe5ff',
    ctaBg: '#f4c64e',
    ctaInk: '#17212b',
    badgeBg: '#f4c64e',
    badgeInk: '#0b1440',
    tileBg: 'rgba(11, 20, 64, 0.88)',
    tileInk: '#ffffff',
    stripBg: '#0b1440',
    stripInk: '#f8dd8f',
    confetti: ['#f4c64e', '#ffffff', '#9fb4ff', '#ffe6a0'],
  },
  BOISHAKH: {
    bg: 'linear-gradient(180deg, #fffaf2 0%, #fff3e3 100%)',
    ink: '#8f0e1c',
    soft: '#4a2a2a',
    ctaBg: '#c1121f',
    ctaInk: '#ffffff',
    badgeBg: '#c1121f',
    badgeInk: '#ffffff',
    tileBg: '#8f0e1c',
    tileInk: '#ffffff',
    stripBg: '#c1121f',
    stripInk: '#ffffff',
    confetti: ['#c1121f', '#f2a900', '#ffffff', '#8f0e1c'],
  },
  PUJA: {
    bg: 'linear-gradient(125deg, #6b0612 0%, #9b0f1f 55%, #c1121f 100%)',
    ink: '#ffffff',
    soft: '#ffe3c2',
    ctaBg: '#f4c64e',
    ctaInk: '#4a0610',
    badgeBg: '#f4c64e',
    badgeInk: '#4a0610',
    tileBg: 'rgba(40, 0, 6, 0.6)',
    tileInk: '#ffffff',
    stripBg: '#6b0612',
    stripInk: '#ffe3a3',
    confetti: ['#f4c64e', '#ffffff', '#ff9f43', '#ffe3a3'],
  },
  WINTER: {
    bg: 'linear-gradient(170deg, #eaf6ff 0%, #cfe8fb 55%, #b3d9f5 100%)',
    ink: '#0a3274',
    soft: '#1f3b63',
    ctaBg: '#0a3274',
    ctaInk: '#ffffff',
    badgeBg: '#ffffff',
    badgeInk: '#0a3274',
    tileBg: '#0a3274',
    tileInk: '#ffffff',
    stripBg: '#0a3274',
    stripInk: '#e3f2ff',
    confetti: ['#ffffff', '#0a3274', '#7cc4f2', '#cfe8fb'],
  },
};

/** Decorative background for each theme. Pure SVG, hidden from screen readers. */
export function ThemePattern({ theme }: { theme: CampaignTheme }) {
  const common = 'pointer-events-none absolute inset-0 size-full';
  switch (theme) {
    case 'MEGA_SALE':
      return (
        <svg className={common} aria-hidden viewBox="0 0 1200 380" preserveAspectRatio="xMaxYMid slice">
          <g fill="#ffffff" opacity="0.13">
            {[
              [90, 70, 46], [1080, 60, 60], [980, 300, 38], [300, 330, 30], [640, 40, 22], [1150, 210, 26], [40, 260, 34],
            ].map(([x, y, r], i) => (
              <path key={i} transform={`translate(${x} ${y})`} d={star(r, r * 0.42, 12)} />
            ))}
          </g>
          <g stroke="#ffd25a" strokeWidth="3" opacity="0.35" fill="none">
            <path d="M-20 360 Q 300 260 620 360 T 1260 340" />
          </g>
        </svg>
      );
    case 'PAYDAY':
      return (
        <svg className={common} aria-hidden viewBox="0 0 1200 380" preserveAspectRatio="xMaxYMid slice">
          {[
            [80, 300, 34], [170, 80, 22], [1100, 90, 40], [1010, 310, 26], [620, 345, 18], [1170, 250, 16],
          ].map(([x, y, r], i) => (
            <g key={i} transform={`translate(${x} ${y})`} opacity="0.22">
              <circle r={r} fill="#f2a900" />
              <circle r={r * 0.78} fill="none" stroke="#7a5600" strokeWidth="2" />
              <text y={r * 0.36} textAnchor="middle" fontSize={r} fontWeight="700" fill="#7a5600">৳</text>
            </g>
          ))}
        </svg>
      );
    case 'EID':
      return (
        <svg className={common} aria-hidden viewBox="0 0 1200 380" preserveAspectRatio="xMaxYMid slice">
          <g fill="#ffffff">
            {[[120, 60], [260, 140], [520, 50], [760, 110], [900, 40], [1150, 160], [60, 220], [680, 300]].map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r={i % 3 ? 1.6 : 2.4} opacity="0.7" />
            ))}
          </g>
          <path d="M1090 70a62 62 0 1 0 38 118 74 74 0 1 1-38-118z" fill="#f4c64e" opacity="0.9" />
          <g stroke="#f4c64e" strokeWidth="2" opacity="0.75" className="max-sm:hidden">
            {[[960, 0, 70], [1010, 0, 120]].map(([x, , len], i) => (
              <g key={i}>
                <line x1={x} y1="0" x2={x} y2={len} />
                <path transform={`translate(${x} ${len})`} d="M-14 0h28l-6 10v26l6 10h-28l6-10v-26z" fill="#f4c64e" fillOpacity="0.35" />
              </g>
            ))}
          </g>
        </svg>
      );
    case 'BOISHAKH':
      return (
        <svg className={common} aria-hidden viewBox="0 0 1200 380" preserveAspectRatio="none">
          <defs>
            <pattern id="alpona" width="60" height="28" patternUnits="userSpaceOnUse">
              <circle cx="30" cy="14" r="7" fill="none" stroke="#c1121f" strokeWidth="2.5" />
              <circle cx="30" cy="14" r="2.5" fill="#c1121f" />
              <path d="M0 14h18M42 14h18" stroke="#c1121f" strokeWidth="2" strokeDasharray="3 4" />
            </pattern>
          </defs>
          <rect x="0" y="0" width="1200" height="28" fill="url(#alpona)" />
          <rect x="0" y="352" width="1200" height="28" fill="url(#alpona)" />
          <rect x="0" y="30" width="1200" height="4" fill="#c1121f" opacity="0.85" />
          <rect x="0" y="346" width="1200" height="4" fill="#c1121f" opacity="0.85" />
        </svg>
      );
    case 'PUJA':
      return (
        <svg className={common} aria-hidden viewBox="0 0 1200 380" preserveAspectRatio="xMaxYMid slice">
          {[[1080, 270, 1]].map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`} opacity="0.32" fill="#f4c64e">
              <path d="M-60 -50h120l-20 100h-80z" />
              <path d="M-60 -50h120M-40 50h80" stroke="#4a0610" strokeWidth="4" />
              <path d="M-56 -30l112 60M56 -30l-112 60" stroke="#4a0610" strokeWidth="3" />
            </g>
          ))}
          <g stroke="#ffe3c2" strokeWidth="2" opacity="0.4">
            {Array.from({ length: 9 }, (_, i) => (
              <line key={i} x1={1150} y1={40} x2={1150 + 60 * Math.cos((i * Math.PI) / 8 + Math.PI / 2)} y2={40 + 60 * Math.sin((i * Math.PI) / 8 + Math.PI / 2)} />
            ))}
          </g>
        </svg>
      );
    case 'WINTER':
      return (
        <svg className={`${common} cmp-snow`} aria-hidden viewBox="0 0 1200 380" preserveAspectRatio="xMaxYMid slice">
          <g stroke="#ffffff" strokeWidth="2.2" strokeLinecap="round" opacity="0.9">
            {[[80, 60, 14], [230, 280, 10], [470, 90, 8], [700, 320, 12], [880, 70, 16], [1060, 250, 11], [1160, 110, 9], [380, 200, 7]].map(([x, y, r], i) => (
              <g key={i} transform={`translate(${x} ${y})`}>
                {[0, 60, 120].map((a) => (
                  <line key={a} x1={-r} y1="0" x2={r} y2="0" transform={`rotate(${a})`} />
                ))}
              </g>
            ))}
          </g>
        </svg>
      );
  }
}

/** Points of a star with `n` tips, centred on 0,0. */
export function star(outer: number, inner: number, n: number): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? inner : outer;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
}
