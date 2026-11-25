// The app's icon, drawn in code (next/og turns it into a PNG): the network
// mark, white on cobalt: a solid hub with spokes to three ringed contacts.
// No text, so no font to load. The geometry is in lib/app-identity.ts
// (NETWORK_MARK, markGeometry), where the maskable safe zone is tested.
//
// Only inline styles and flexbox here: next/og supports a subset of CSS.

import { ICON_COLORS, markGeometry, type IconShape } from "@/lib/app-identity";

export function AppIcon({ size, shape }: { size: number; shape: IconShape }) {
  const mark = markGeometry(shape);
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        background: ICON_COLORS.field,
        // The tab and Android "any" icons are a rounded square; iPhone and maskable fill the square.
        borderRadius: shape === "rounded" ? Math.round(size * 0.225) : 0,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100">
        {mark.spokes.map(([[x1, y1], [x2, y2]], i) => (
          <line key={`s${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke={ICON_COLORS.mark} strokeWidth={mark.stroke} strokeLinecap="round" />
        ))}
        {mark.rings.map(([cx, cy], i) => (
          <circle key={`r${i}`} cx={cx} cy={cy} r={mark.ringRadius} fill="none" stroke={ICON_COLORS.mark} strokeWidth={mark.stroke} />
        ))}
        <circle cx={mark.hub.center[0]} cy={mark.hub.center[1]} r={mark.hub.r} fill={ICON_COLORS.mark} />
      </svg>
    </div>
  );
}
