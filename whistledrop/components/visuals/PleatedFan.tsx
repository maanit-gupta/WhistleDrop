import { MediaFrame, type MediaFrameProps } from "@/components/visuals/MediaFrame";
import { polar } from "@/components/visuals/geometry";
import styles from "./PleatedFan.module.css";

// A ribbed, pleated fan sculpture: a rosette of folded pleats clipped to a
// half circle. The pleat layer turns by exactly two pleats every 12s, so the
// loop is seamless; the lighting overlay stays still, which reads as the
// sculpture turning under a fixed light.

const W = 1000;
const H = 600;
const CX = 500;
const CY = 584;
const PLEATS = 48;
const STEP = 360 / PLEATS; // 7.5°
const R_VALLEY = 500;
const R_CREST = 536;

const pleats = Array.from({ length: PLEATS }, (_, i) => {
  const a0 = i * STEP;
  const am = a0 + STEP / 2;
  const a1 = a0 + STEP;
  const v0 = polar(CX, CY, R_VALLEY, a0);
  const crest = polar(CX, CY, R_CREST, am);
  const v1 = polar(CX, CY, R_VALLEY, a1);
  return {
    lit: `M${CX},${CY}L${v0.join(",")}L${crest.join(",")}Z`,
    shade: `M${CX},${CY}L${crest.join(",")}L${v1.join(",")}Z`,
    ridge: `M${polar(CX, CY, 70, am).join(",")}L${crest.join(",")}`,
    valley: `M${polar(CX, CY, 70, a0).join(",")}L${v0.join(",")}`,
  };
});

export function PleatedFan(props: Omit<MediaFrameProps, "children" | "slot">) {
  return (
    <MediaFrame slot="pleated-fan" tint="lime-wash" {...props}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" focusable="false">
        <defs>
          <clipPath id="pf-half">
            <rect x="0" y="0" width={W} height={CY} />
          </clipPath>
          <radialGradient id="pf-depth" cx={CX} cy={CY} r={R_CREST} gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#000" stopOpacity="0.7" />
            <stop offset="0.16" stopColor="#000" stopOpacity="0.25" />
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="0.9" stopColor="#000" stopOpacity="0.12" />
            <stop offset="1" stopColor="#000" stopOpacity="0.35" />
          </radialGradient>
          <linearGradient id="pf-light" x1="0" y1="0" x2="1" y2="0.6">
            <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
            <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.3" />
          </linearGradient>
          <radialGradient id="pf-hub" cx="0.4" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#8a8a8a" />
            <stop offset="1" stopColor="#1c1c1c" />
          </radialGradient>
        </defs>

        <g clipPath="url(#pf-half)">
          <g className={styles.pleats}>
            {pleats.map((p, i) => (
              <g key={i}>
                <path d={p.lit} fill="#f2f2f2" />
                <path d={p.shade} fill="#8d8d8d" />
                <path d={p.valley} stroke="#3c3c3c" strokeWidth="1" strokeOpacity="0.6" />
                <path d={p.ridge} stroke="#fff" strokeWidth="1.4" strokeOpacity="0.8" />
              </g>
            ))}
          </g>
          <rect width={W} height={H} fill="url(#pf-depth)" />
          <rect width={W} height={H} fill="url(#pf-light)" />
          <circle cx={CX} cy={CY} r="74" fill="url(#pf-hub)" />
          <circle cx={CX} cy={CY} r="74" fill="none" stroke="#fff" strokeOpacity="0.35" />
        </g>
        <rect x="0" y={CY} width={W} height={H - CY} fill="#6e6e6e" />
      </svg>
    </MediaFrame>
  );
}
