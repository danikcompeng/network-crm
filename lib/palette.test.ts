import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEPTH_FADE, LIMB } from "./map-3d";
import { NON_TEXT_PAIRS, PALETTE, TEXT_PAIRS, contrast, type Mode } from "./palette";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

/** The --name: #hex values in the block that follows `marker` in globals.css. */
function cssColors(marker: string): Record<string, string> {
  const start = css.indexOf(marker);
  if (start === -1) throw new Error(`globals.css has no "${marker}" block`);
  const block = css.slice(start, css.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6});/g)].map((m) => [m[1], m[2].toUpperCase()]));
}

describe.each(["light", "dark"] as Mode[])("%s palette", (mode) => {
  const colors = PALETTE[mode];

  it.each(TEXT_PAIRS)("%s text on %s is at least 4.5:1", (text, on) => {
    expect(contrast(colors[text], colors[on])).toBeGreaterThanOrEqual(4.5);
  });

  it.each(NON_TEXT_PAIRS)("%s on %s is at least 3:1", (mark, on) => {
    expect(contrast(colors[mark], colors[on])).toBeGreaterThanOrEqual(3);
  });

  it("globals.css has exactly these colours", () => {
    const fromCss = cssColors(mode === "light" ? "/* light */" : "/* dark */");
    const expected = Object.fromEntries(Object.entries(colors).map(([k, v]) => [k, v.toUpperCase()]));
    expect(fromCss).toEqual(expected);
  });
});

describe("the 3D map's shading keeps the spheres' contrast", () => {
  // The shader works in linear light: darken the rim, then fade toward the background.
  const toLinear = (hex: string) =>
    [1, 3, 5].map((i) => {
      const v = parseInt(hex.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
  const toHex = (rgb: number[]) =>
    "#" +
    rgb
      .map((v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)))
      .map((v) => Math.min(255, Math.max(0, v)).toString(16).padStart(2, "0"))
      .join("");
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t);

  it.each(["light", "dark"] as Mode[])("%s: a faded sphere's rim on the background, and a glyph on a faded sphere, are 3:1", (mode) => {
    const space = PALETTE[mode].space;
    for (const role of ["sphere-muted", "sphere-ink", "sphere-accent"] as const) {
      const base = toLinear(PALETTE[mode][role]);
      const rim = toHex(mix(base.map((v) => v * LIMB), toLinear(space), DEPTH_FADE));
      const middle = toHex(mix(base, toLinear(space), DEPTH_FADE));
      expect(contrast(rim, space), `${role} rim`).toBeGreaterThanOrEqual(3);
      expect(contrast(space, middle), `${role} glyph`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("contrast", () => {
  it("matches known WCAG values", () => {
    expect(contrast("#FFFFFF", "#000000")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#FFFFFF")).toBeCloseTo(4.48, 2);
    expect(contrast("#FFFFFF", "#FFFFFF")).toBe(1);
  });
});

describe("no mixed colours", () => {
  // bg-ink/50, border-edge/60...: a colour mixed with opacity is a new
  // colour the contrast checks above never see. Use a token instead.
  it("components and pages never put an opacity on a colour token", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const root = fileURLToPath(new URL("..", import.meta.url));
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = `${dir}/${name}`;
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts")) files.push(path);
      }
    };
    walk(`${root}app`);
    walk(`${root}components`);
    const roles = Object.keys(PALETTE.light).join("|");
    const mixed = new RegExp(String.raw`\b(?:bg|text|border|ring|outline|fill|stroke|divide|from|to|via)-(?:${roles})/\d+`);
    // It can fail: a mixed colour is caught, a plain one isn't.
    expect(mixed.test('className="bg-ink/50"')).toBe(true);
    expect(mixed.test('className="bg-ink text-ink-muted"')).toBe(false);
    const offenders = files.filter((f) => mixed.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
