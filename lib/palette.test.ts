import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
    const mixed = new RegExp(`\b(?:bg|text|border|ring|outline|fill|stroke|divide|from|to|via)-(?:${roles})/\d+`);
    const offenders = files.filter((f) => mixed.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
