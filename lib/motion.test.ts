import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EASE_OUT, MOTION } from "./motion";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

describe("motion tokens", () => {
  it.each(Object.entries(MOTION))("--motion-%s in globals.css is %i ms", (name, ms) => {
    expect(css).toContain(`--motion-${name}: ${ms}ms;`);
  });
  it("the ease matches", () => {
    expect(css).toContain(`--ease-out: ${EASE_OUT};`);
  });
});
