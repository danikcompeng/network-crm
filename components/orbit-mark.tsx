// The orbit mark: a solid dot (you), a tilted orbit passing behind and in
// front of it, and a small dot (a person) on the orbit. One drawing for the app icon (next/og, white on
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
  /** Prefix for the masks' ids: give each mark on one page its own. */
  idPrefix?: string;
};

export function OrbitMark({
  size,
  shape = "full",
  color = "currentColor",
  cropped = false,
  idPrefix = "orbit-mark",
  ...props
}: OrbitMarkProps) {
  const mark = markGeometry(shape);
  const [left, top, right, bottom] = markBounds(mark);
  const box = cropped ? { x: left, y: top, w: right - left, h: bottom - top } : { x: 0, y: 0, w: 100, h: 100 };
  const width = Math.round(((size * box.w) / box.h) * 100) / 100;
  // Decorative unless a caller names it.
  const hidden = props["aria-label"] ? {} : { "aria-hidden": true, focusable: false };
  const [cx, cy] = mark.center;
  // Masks, not field-coloured shapes, cut the gaps, so the mark works on
  // any background (the cobalt icon, the login page in either theme).
  const behind = `${idPrefix}-behind`;
  const inFront = `${idPrefix}-in-front`;
  return (
    <svg width={width} height={size} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} {...hidden} {...props}>
      <defs>
        {/* The orbit, drawn whole (no seam), stops `gap` short of the dot behind it; its near half is kept. */}
        <mask id={behind} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect x="0" y="0" width="100" height="100" fill="#fff" />
          <circle cx={cx} cy={cy} r={mark.core + mark.gap} fill="#000" />
          <path d={mark.nearPath} fill="none" stroke="#fff" strokeWidth={mark.stroke + 2} />
        </mask>
        {/* The dot is cut `gap` wide either side of the near half crossing it. */}
        <mask id={inFront} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
          <rect x="0" y="0" width="100" height="100" fill="#fff" />
          <path d={mark.nearPath} fill="none" stroke="#000" strokeWidth={mark.stroke + 2 * mark.gap} />
        </mask>
      </defs>
      {/* The mask goes on a group: on the ellipse itself it would turn with the ellipse's transform. */}
      <g mask={`url(#${behind})`}>
        <ellipse
          cx={cx}
          cy={cy}
          rx={mark.orbit.rx}
          ry={mark.orbit.ry}
          transform={`rotate(${mark.orbit.tilt} ${cx} ${cy})`}
          fill="none"
          stroke={color}
          strokeWidth={mark.stroke}
        />
      </g>
      <circle cx={cx} cy={cy} r={mark.core} fill={color} mask={`url(#${inFront})`} />
      <circle cx={mark.moon.center[0]} cy={mark.moon.center[1]} r={mark.moon.r} fill={color} />
    </svg>
  );
}
