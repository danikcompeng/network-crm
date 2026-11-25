// The motion rule (plans/crm.md, Feature 6; the token values are checked in lib/motion.test.ts): with Reduce Motion, nothing
// moves. Every transition or animation of position or size, in a component
// class or in globals.css, sits behind `motion-safe:` or
// `prefers-reduced-motion: no-preference`. Colour and opacity changes are
// fine. Motion guarded in JavaScript is named in ALLOWED.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EASE_OUT, MOTION } from "./motion";

const ROOT = `${__dirname}/../`;

/** Guarded in JavaScript instead: file and class. */
const ALLOWED = new Set([
  "components/network-map.tsx transition-transform", // the map's first ease, only when useReducedMotion() is false
]);

const MOVING = /transform|translate|scale|rotate|top|left|right|bottom|width|height|inset|margin/;

/** Comments out, so words like "transition" in prose don't count. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

/** Motion classes in a source file that aren't behind motion-safe:. */
export function unguardedMotion(source: string): string[] {
  const found: string[] = [];
  // Variants are anything up to a colon: md:, 2xl:, data-[open]:, group-hover/row:, motion-safe:.
  const token = /(?<=["'`\s{(])((?:[^\s"'`:]+:)*)(transition(?:-[^\s"'`}]+)?|animate-[^\s"'`}]+)(?=["'`\s})])/g;
  for (const [, variants, utility] of stripComments(source).matchAll(token)) {
    if (variants.split(":").includes("motion-safe")) continue;
    if (utility === "animate-none") continue;
    const moves =
      utility === "transition" ||
      utility === "transition-all" ||
      utility === "transition-transform" ||
      utility.startsWith("animate-") ||
      (utility.startsWith("transition-[") && MOVING.test(utility));
    if (moves) found.push(utility);
  }
  return found;
}

/** `animation:` / `transition:` declarations in CSS that move things outside a no-preference block. */
export function unguardedCssMotion(css: string): string[] {
  const found: string[] = [];
  const stack: string[] = [];
  let prelude = "";
  const text = stripComments(css);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "{") {
      stack.push(prelude.trim());
      prelude = "";
    } else if (c === "}" || c === ";") {
      // A block's last declaration may have no ";": check it at the "}".
      const declaration = prelude.trim();
      prelude = "";
      const closing = c === "}";
      const blocks = [...stack];
      if (closing) stack.pop();
      const m = /^(animation|transition)(?:-[a-z]+)?\s*:\s*([\s\S]+)$/.exec(declaration);
      if (!m) continue;
      if (blocks.some((p) => p.startsWith("@keyframes") || p.includes("prefers-reduced-motion: no-preference"))) continue;
      const value = m[2];
      // A transition of colours or opacity only is fine; an animation could move anything.
      if (m[1] === "transition" && !/\b(all|transform|translate|scale|rotate)\b/.test(value) && !MOVING.test(value)) continue;
      found.push(declaration);
    } else {
      prelude += c;
    }
  }
  return found;
}

function sourceFiles(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(`${ROOT}${dir}`)) {
      const path = `${dir}/${name}`;
      if (statSync(`${ROOT}${path}`).isDirectory()) walk(path);
      else if (/\.tsx$/.test(name)) files.push(path);
    }
  };
  walk("app");
  walk("components");
  return files;
}

describe("the motion rule", () => {
  it("finds what it should (so it can fail)", () => {
    expect(unguardedMotion(`<div className="transition-transform duration-200">`)).toEqual(["transition-transform"]);
    expect(unguardedMotion(`<div className="hover:transition px-2">`)).toEqual(["transition"]);
    expect(unguardedMotion(`<div className="2xl:transition-transform data-[open]:animate-[sheet-up_1s] group-hover/row:transition-all">`)).toEqual([
      "transition-transform",
      "animate-[sheet-up_1s]",
      "transition-all",
    ]);
    expect(unguardedMotion(`<div className="data-[open]:motion-safe:animate-[sheet-up_1s]">`)).toEqual([]);
    expect(unguardedMotion(`<div className="open:animate-[sheet-up_1s]">`)).toEqual(["animate-[sheet-up_1s]"]);
    expect(unguardedMotion(`cls = "transition-[transform,opacity] x"`)).toEqual(["transition-[transform,opacity]"]);
    expect(unguardedMotion(`<div className="motion-safe:open:animate-[sheet-up_1s] motion-safe:transition-all">`)).toEqual([]);
    expect(unguardedMotion(`<div className="transition-colors transition-opacity transition-[background-color,color]">`)).toEqual([]);
    expect(unguardedMotion(`// the transition is dropped once played\nconst transitioning = true;`)).toEqual([]);
    expect(unguardedCssMotion(`.a { transition: transform 1s; }`)).toEqual(["transition: transform 1s"]);
    expect(unguardedCssMotion(`.a { animation: spin 1s; }`)).toEqual(["animation: spin 1s"]);
    expect(unguardedCssMotion(`.toast { animation: rise 200ms }`)).toEqual(["animation: rise 200ms"]);
    expect(unguardedCssMotion(`@media (prefers-reduced-motion: no-preference) { .a { color: red; animation: spin 1s } } .b { color: blue }`)).toEqual([]);
    expect(unguardedCssMotion(`@media (prefers-reduced-motion: no-preference) { .a { animation: spin 1s; } }`)).toEqual([]);
    expect(unguardedCssMotion(`.a { transition: color 150ms, background-color 150ms; }`)).toEqual([]);
    expect(unguardedCssMotion(`@keyframes x { from { transform: none; } }`)).toEqual([]);
  });

  it("every component class that moves things is behind motion-safe: (or guarded in JavaScript, by name)", () => {
    const offenders = sourceFiles().flatMap((file) =>
      unguardedMotion(readFileSync(`${ROOT}${file}`, "utf8"))
        .map((utility) => `${file} ${utility}`)
        .filter((entry) => !ALLOWED.has(entry)),
    );
    expect(offenders).toEqual([]);
  });

  it("the allowlist names motion that still exists (no stale entries)", () => {
    for (const entry of ALLOWED) {
      const [file, utility] = entry.split(" ");
      expect(unguardedMotion(readFileSync(`${ROOT}${file}`, "utf8")), entry).toContain(utility);
    }
  });

  it("globals.css moves nothing outside a no-preference block", () => {
    expect(unguardedCssMotion(readFileSync(`${ROOT}app/globals.css`, "utf8"))).toEqual([]);
  });

  it("the scrim's fade (written out: ::backdrop may not inherit variables) uses the sheet's timing", () => {
    expect(readFileSync(`${ROOT}app/globals.css`, "utf8")).toContain(`animation: scrim-in ${MOTION.sheet}ms ${EASE_OUT};`);
  });
});
