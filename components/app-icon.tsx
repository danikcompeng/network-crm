// The app's icon, drawn in code (next/og turns it into a PNG): the orbit
// mark, white on cobalt. No text, so no font to load. The geometry is in
// lib/app-identity.ts (ORBIT_MARK, markGeometry), where the maskable safe
// zone is tested.
//
// Only inline styles and flexbox here: next/og supports a subset of CSS.

import { OrbitMark } from "@/components/orbit-mark";
import { ICON_COLORS, type IconShape } from "@/lib/app-identity";

export function AppIcon({ size, shape }: { size: number; shape: IconShape }) {
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
      <OrbitMark size={size} shape={shape} color={ICON_COLORS.mark} />
    </div>
  );
}
