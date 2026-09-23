import { MediaFrame, type MediaFrameProps } from "@/components/visuals/MediaFrame";
import type { MediaSlot } from "@/components/visuals/media";

// Grayscale abstract forms for SlideTile's left tiles. Three compositions;
// each maps to its own /public/media slot.

export type AbstractVariant = 0 | 1 | 2;

const SLOTS: Record<AbstractVariant, MediaSlot> = {
  0: "abstract-tile-1",
  1: "abstract-tile-2",
  2: "abstract-tile-3",
};

function Sphere() {
  return (
    <>
      <defs>
        <radialGradient id="at0-sphere" cx="0.35" cy="0.3" r="0.75">
          <stop offset="0" stopColor="#f0f0f0" />
          <stop offset="0.5" stopColor="#8a8a8a" />
          <stop offset="1" stopColor="#1a1a1a" />
        </radialGradient>
        <linearGradient id="at0-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a3a3a" />
          <stop offset="1" stopColor="#101010" />
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill="#202020" />
      <rect y="270" width="400" height="130" fill="url(#at0-floor)" />
      <ellipse cx="210" cy="300" rx="120" ry="14" fill="#000" opacity="0.5" />
      <circle cx="200" cy="190" r="110" fill="url(#at0-sphere)" />
      <path d="M40,120 A180,180 0 0 1 360,120" fill="none" stroke="#bdbdbd" strokeOpacity="0.5" />
    </>
  );
}

function Arches() {
  return (
    <>
      <defs>
        <linearGradient id="at1-arch" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5a5a5a" />
          <stop offset="0.5" stopColor="#d6d6d6" />
          <stop offset="1" stopColor="#3a3a3a" />
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill="#161616" />
      {[0, 1, 2, 3].map((i) => {
        const x = 40 + i * 84;
        const h = 150 + i * 40;
        return (
          <path
            key={i}
            d={`M${x},400 V${400 - h} a36,36 0 0 1 72,0 V400 Z`}
            fill="url(#at1-arch)"
            opacity={0.55 + i * 0.12}
          />
        );
      })}
      <line x1="0" y1="340" x2="400" y2="340" stroke="#fff" strokeOpacity="0.15" />
    </>
  );
}

function Folds() {
  return (
    <>
      <defs>
        <linearGradient id="at2-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#efefef" />
          <stop offset="1" stopColor="#6c6c6c" />
        </linearGradient>
        <linearGradient id="at2-b" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9a9a9a" />
          <stop offset="1" stopColor="#1e1e1e" />
        </linearGradient>
      </defs>
      <rect width="400" height="400" fill="#1b1b1b" />
      <polygon points="60,360 180,60 250,200" fill="url(#at2-a)" />
      <polygon points="180,60 250,200 360,120" fill="url(#at2-b)" />
      <polygon points="60,360 250,200 330,380" fill="url(#at2-b)" opacity="0.8" />
      <polygon points="250,200 360,120 330,380" fill="url(#at2-a)" opacity="0.55" />
    </>
  );
}

const ART: Record<AbstractVariant, () => React.JSX.Element> = { 0: Sphere, 1: Arches, 2: Folds };

export function AbstractTile({
  variant = 0,
  ...props
}: Omit<MediaFrameProps, "children" | "slot"> & { variant?: AbstractVariant }) {
  const Art = ART[variant];
  return (
    <MediaFrame slot={SLOTS[variant]} {...props}>
      <svg viewBox="0 0 400 400" preserveAspectRatio="xMidYMid slice" focusable="false">
        <Art />
      </svg>
    </MediaFrame>
  );
}
