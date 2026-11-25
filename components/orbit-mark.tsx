// The orbit mark: a solid dot (you), one ring around it, and a small dot (a
// person) on the ring. One drawing for the app icon (next/og, white on
// cobalt) and the login screen (currentColor). The geometry and its tests
// are in lib/app-identity.ts (ORBIT_MARK, markGeometry).
//
// Only plain SVG here: next/og renders the app icon from it.

import type { SVGProps } from "react";
import { markBounds, markGeometry, type IconShape } from "@/lib/app-identity";

type OrbitMarkProps = Omit<SVGProps<SVGSVGElement>, "color"> & {
  size: number;
  /** The icon shape whose geometry to draw ("full" unless it's the maskable icon). */
  shape?: IconShape;
  color?: string;
  /**
   * Trim the box to the drawing, for use in a page: the mark then lines up
   * with the text column instead of floating inside the icon's margin.
   * `size` is then its height; it's a little wider than tall.
   */
  cropped?: boolean;
};

export function OrbitMark({ size, shape = "full", color = "currentColor", cropped = false, ...props }: OrbitMarkProps) {
  const mark = markGeometry(shape);
  const [left, top, right, bottom] = markBounds(mark);
  const box = cropped ? { x: left, y: top, w: right - left, h: bottom - top } : { x: 0, y: 0, w: 100, h: 100 };
  const width = Math.round((size * box.w) / box.h * 100) / 100;
  // Decorative unless a caller names it.
  const hidden = props["aria-label"] ? {} : { "aria-hidden": true, focusable: false };
  return (
    <svg width={width} height={size} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} {...hidden} {...props}>
      <circle cx={mark.center[0]} cy={mark.center[1]} r={mark.core} fill={color} />
      <circle cx={mark.center[0]} cy={mark.center[1]} r={mark.orbit} fill="none" stroke={color} strokeWidth={mark.stroke} />
      <circle cx={mark.moon.center[0]} cy={mark.moon.center[1]} r={mark.moon.r} fill={color} />
    </svg>
  );
}
