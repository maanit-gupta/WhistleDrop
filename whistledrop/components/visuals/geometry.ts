// Small helpers for the generated SVG art. Everything is deterministic so the
// server and client render identical markup (no hydration mismatches).

/** Seeded PRNG (mulberry32): same seed, same sequence, everywhere. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rounds for stable, compact SVG attributes. */
export const r2 = (n: number) => Math.round(n * 100) / 100;

/** Point on a circle; angle in degrees, 0 = right, counter-clockwise (screen y is flipped). */
export function polar(cx: number, cy: number, radius: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [r2(cx + radius * Math.cos(rad)), r2(cy - radius * Math.sin(rad))];
}
