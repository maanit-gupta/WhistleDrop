import { MediaFrame, type MediaFrameProps } from "@/components/visuals/MediaFrame";

// Glossy white ribbons sweeping diagonally, grayscale. Each ribbon is a wide
// stroke painted with a reflected gradient that runs across it, which reads
// as soft specular bands along its length.

const RIBBONS = [
  { d: "M-160,760 C140,560 320,700 560,420 S880,60 1180,-60", width: 150, period: 120, opacity: 0.35, blur: true },
  { d: "M-120,640 C160,520 380,600 600,330 S900,20 1160,-40", width: 96, period: 80, opacity: 0.95, blur: false },
  { d: "M-60,820 C260,700 500,760 700,520 S980,200 1200,120", width: 64, period: 60, opacity: 0.8, blur: false },
  { d: "M-200,520 C60,420 260,470 420,260 S700,-60 900,-160", width: 44, period: 40, opacity: 0.55, blur: false },
];

export function DiagonalRibbons(props: Omit<MediaFrameProps, "children" | "slot">) {
  return (
    <MediaFrame slot="diagonal-ribbons" {...props}>
      <svg viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice" focusable="false">
        <defs>
          <linearGradient id="dr-bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#1d1d1d" />
            <stop offset="1" stopColor="#0b0b0b" />
          </linearGradient>
          {RIBBONS.map((r, i) => (
            <linearGradient
              key={i}
              id={`dr-gloss-${i}`}
              gradientUnits="userSpaceOnUse"
              x1="0"
              y1="0"
              x2={r.period}
              y2={r.period}
              spreadMethod="reflect"
            >
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.35" stopColor="#d9d9d9" />
              <stop offset="0.7" stopColor="#8c8c8c" />
              <stop offset="1" stopColor="#f5f5f5" />
            </linearGradient>
          ))}
          <filter id="dr-soft" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="8" />
          </filter>
        </defs>
        <rect width="1000" height="700" fill="url(#dr-bg)" />
        {RIBBONS.map((r, i) => (
          <g key={i} opacity={r.opacity} filter={r.blur ? "url(#dr-soft)" : undefined}>
            <path d={r.d} fill="none" stroke={`url(#dr-gloss-${i})`} strokeWidth={r.width} strokeLinecap="butt" />
            <path
              d={r.d}
              fill="none"
              stroke="#fff"
              strokeOpacity="0.85"
              strokeWidth="1.5"
              transform={`translate(${-r.width * 0.18} ${-r.width * 0.18})`}
            />
          </g>
        ))}
      </svg>
    </MediaFrame>
  );
}
