import { polar, r2, seeded } from "@/components/visuals/geometry";

// The WhistleDrop mark: a circle drawn from scattered white dashes.
// Generated once, deterministically, so it's identical on server and client.

const rand = seeded(0x5eed);
const DASHES = Array.from({ length: 44 }, (_, i) => {
  const angle = (i / 44) * 360 + (rand() - 0.5) * 7;
  const radius = 38 + (rand() - 0.5) * 9;
  const length = 5 + rand() * 7;
  // Mostly tangential, each tilted a little differently.
  const tilt = angle + 90 + (rand() - 0.5) * 50;
  const [cx, cy] = polar(50, 50, radius, angle);
  const [dx, dy] = polar(0, 0, length / 2, tilt);
  return { x1: r2(cx - dx), y1: r2(cy - dy), x2: r2(cx + dx), y2: r2(cy + dy), opacity: r2(0.55 + rand() * 0.45) };
});

export interface MonogramProps {
  size?: number;
  /** Accessible name; omit when adjacent text already names the brand. */
  title?: string;
  className?: string;
}

export function Monogram({ size = 40, title, className }: MonogramProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <g stroke="currentColor" strokeWidth="3.2" strokeLinecap="round">
        {DASHES.map((d, i) => (
          <line key={i} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} strokeOpacity={d.opacity} />
        ))}
      </g>
    </svg>
  );
}
