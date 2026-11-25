import { describe, expect, it } from "vitest";
import { cleanLoginCode, looksLikeEmail } from "./login-code";

describe("cleanLoginCode", () => {
  it("keeps 6 to 10 digits", () => {
    expect(cleanLoginCode("123456")).toBe("123456");
    expect(cleanLoginCode("1234567890")).toBe("1234567890");
  });
  it("strips spaces and dashes from a pasted code", () => {
    expect(cleanLoginCode(" 1234 5678 ")).toBe("12345678");
    expect(cleanLoginCode("123-456")).toBe("123456");
  });
  it("refuses too short, too long, or non-digits", () => {
    for (const bad of ["12345", "12345678901", "12a456", "", "١٢٣٤٥٦"]) {
      expect(cleanLoginCode(bad)).toBeNull();
    }
  });
});

describe("looksLikeEmail", () => {
  it("accepts ordinary addresses and refuses obvious typos", () => {
    expect(looksLikeEmail("me@example.com")).toBe(true);
    expect(looksLikeEmail("first.last+tag@sub.example.co")).toBe(true);
    for (const bad of ["me", "me@", "@example.com", "me@example", "me @example.com", ""]) {
      expect(looksLikeEmail(bad)).toBe(false);
    }
  });
});
