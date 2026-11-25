import { describe, expect, it } from "vitest";
import { APPLICATION_COLUMNS, checkApplication } from "./application-input";

const TODAY = "2026-11-24";
const check = (raw: Record<string, unknown>) => checkApplication(raw, { today: TODAY });

describe("checkApplication", () => {
  it("tidies a full application; empty is null; status defaults to applied", () => {
    expect(
      check({
        company: "  Kestrel  Systems ",
        role: "Firmware Intern",
        status: "",
        applied_on: "2026-11-03",
        deadline: "",
        link: "www.kestrel.example/jobs/1",
        location: " Toronto ",
        contact_id: "",
        notes: "",
      }),
    ).toEqual({
      ok: true,
      value: {
        company: "Kestrel Systems",
        role: "Firmware Intern",
        status: "applied",
        applied_on: "2026-11-03",
        deadline: null,
        link: "https://www.kestrel.example/jobs/1",
        location: "Toronto",
        contact_id: null,
        notes: null,
      },
    });
  });

  it("returns exactly the nine writable columns", () => {
    const result = check({ company: "A", role: "B", id: "x", user_id: "y", updated_at: "z" });
    expect(result.ok && Object.keys(result.value).sort()).toEqual([...APPLICATION_COLUMNS].sort());
  });

  it("needs a company and a role", () => {
    expect(check({ company: " ", role: "" })).toMatchObject({ ok: false, fieldErrors: { company: "Which company?", role: "Which role?" } });
  });

  it("refuses links that aren't web addresses, a future applied date, an unknown status and a bad person id", () => {
    const result = check({
      company: "A",
      role: "B",
      link: "javascript:alert(1)",
      applied_on: "2026-11-25",
      status: "ghosted",
      contact_id: "1; drop",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.fieldErrors).sort()).toEqual(["applied_on", "contact_id", "link", "status"]);
  });

  it("a deadline may be in the past or future, but must be a real day in range", () => {
    expect(check({ company: "A", role: "B", deadline: "2026-11-01" }).ok).toBe(true);
    expect(check({ company: "A", role: "B", deadline: "2101-01-01" }).ok).toBe(false);
  });
});
