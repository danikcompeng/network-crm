import { describe, expect, it } from "vitest";
import { currentTab } from "./tab-bar";

const TABS = [{ href: "/" }, { href: "/people" }, { href: "/applications" }];

describe("currentTab", () => {
  it.each([
    ["/", "/"],
    ["/people", "/people"],
    ["/people/3f2c1a9e/edit", "/people"],
    ["/applications/import", "/applications"],
    ["/peoplex", null],
    ["/login", null],
  ])("%s → %s", (path, tab) => {
    expect(currentTab(path, TABS)).toBe(tab);
  });
});
