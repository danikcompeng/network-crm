// Network's colours, light and dark (plans/crm.md, Design direction).
//
// app/globals.css holds the same values as CSS variables, which is what
// the screens use. This file exists so the colours can be tested:
// lib/palette.test.ts checks every pairing used on screen meets WCAG
// contrast (4.5:1 for text, 3:1 for marks, borders and focus rings), and
// that globals.css still matches these values.
//
// Hex is allowed only here and in globals.css (and in the status bar
// colour, which must be a plain value).

export type ColorRole =
  | "background"
  | "surface"
  | "surface-sunk"
  | "ink"
  | "ink-muted"
  | "line"
  | "line-strong"
  | "edge"
  | "surface-press"
  | "accent"
  | "accent-fill"
  | "on-accent"
  | "accent-tint"
  | "danger";

export type Mode = "light" | "dark";

export const PALETTE: Record<Mode, Record<ColorRole, string>> = {
  light: {
    background: "#F8F7F4", // paper
    surface: "#FFFFFF", // rows, cards, sheets, inputs
    "surface-sunk": "#EFEEEA", // pressed rows, skeletons, chip backgrounds
    ink: "#1D2125", // graphite
    "ink-muted": "#575D66",
    line: "#E3E2DD", // dividers between rows inside a card (decorative: never the only edge of a control)
    "line-strong": "#D2D0C9", // the edge of a card or sheet on the page
    edge: "#858A91", // the edge of a control (text box, secondary button) and the map's introduction lines: 3:1
    "surface-press": "#E8E6E0", // a pressed row or ghost button; chip backgrounds
    accent: "#1D4ED8", // cobalt: text, marks, "you", focus, links
    "accent-fill": "#1D4ED8", // cobalt as a large fill (primary buttons)
    "on-accent": "#FFFFFF", // text on accent-fill
    "accent-tint": "#E4EBFC", // selected filters, the current tab
    danger: "#B3261E",
  },
  dark: {
    background: "#131518", // graphite, never pure black
    surface: "#1C1F23",
    "surface-sunk": "#0D0F11",
    ink: "#ECEEF0",
    "ink-muted": "#A0A7B0",
    line: "#2C3036",
    "line-strong": "#3A3F46",
    edge: "#6B7178",
    "surface-press": "#262A2F",
    accent: "#8AA8FF", // cobalt lightened for text and marks, so it reads at night
    "accent-fill": "#3D63E0", // a deeper cobalt for big fills: #8AA8FF as a whole button glares
    "on-accent": "#FFFFFF",
    "accent-tint": "#1D2846",
    danger: "#FF8C82",
  },
};

/** Text that appears on screen, and what it sits on. Each must be 4.5:1. */
export const TEXT_PAIRS: readonly [text: ColorRole, on: ColorRole][] = [
  ["ink", "background"],
  ["ink", "surface"],
  ["ink", "surface-sunk"],
  ["ink", "accent-tint"],
  ["ink-muted", "background"],
  ["ink-muted", "surface"],
  ["ink-muted", "surface-sunk"],
  ["ink-muted", "accent-tint"],
  ["accent", "background"],
  ["accent", "surface"],
  ["accent", "surface-sunk"],
  ["accent", "accent-tint"], // the current tab / selected filter label
  ["accent", "surface-press"],
  ["ink", "surface-press"], // a pressed row; chip labels
  ["ink-muted", "surface-press"],
  ["danger", "surface-press"],
  ["on-accent", "accent-fill"], // primary button label
  ["danger", "background"],
  ["danger", "surface"],
  ["surface", "danger"], // the Delete button: light text on red
];

/** Icons, borders and focus rings, and what they sit on. Each must be 3:1. */
export const NON_TEXT_PAIRS: readonly [mark: ColorRole, on: ColorRole][] = [
  ["accent", "background"], // focus ring (drawn just outside the element, on the page)
  ["accent", "surface"], // focus ring inside a card; "you" on the map
  ["edge", "surface"], // edge of a text box or secondary button, so you can find it
  ["edge", "background"], // ... and the map's introduction lines on the page
  ["ink-muted", "surface"], // icons and stage shapes
  ["ink-muted", "background"],
  ["accent-fill", "background"], // a primary button's shape on the page
  ["danger", "surface"], // edge of a text box with an error
  ["danger", "background"], // its focus ring
];

/** WCAG relative luminance of "#RRGGBB". */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two "#RRGGBB" colours (1 to 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
