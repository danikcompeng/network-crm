import { describe, expect, it } from "vitest";
import {
  applicationOrder,
  filterApplications,
  inFilter,
  parseStatusFilter,
  rowDate,
  statusChange,
  statusTone,
  type ApplicationRow,
} from "./applications";

const TODAY = "2026-11-24";
let n = 0;
const app = (company: string, extra: Partial<ApplicationRow> = {}): ApplicationRow => ({
  id: `id-${++n}`,
  company,
  role: "Intern",
  status: "applied",
  applied_on: null,
  deadline: null,
  link: null,
  location: null,
  contact_id: null,
  notes: null,
  updated_at: "2026-11-24T12:00:00Z",
  ...extra,
});

const ROWS = [
  app("Kestrel", { status: "interviewing", applied_on: "2026-11-03" }),
  app("Halcyon", { status: "saved", deadline: "2026-12-10" }),
  app("Northwind", { status: "online_assessment", applied_on: "2026-11-10" }),
  app("Orchard", { status: "saved" }),
  app("Tidewater", { status: "rejected", applied_on: "2026-10-01" }),
  app("Brightline", { status: "offer", applied_on: "2026-10-20" }),
  app("Maple", { status: "applied" }),
  app("Quarry", { status: "saved", deadline: "2026-11-30" }),
  app("Larkspur", { status: "saved", deadline: "2026-09-01" }), // long passed
  app("Lakeshore", { status: "saved", deadline: "2026-11-20" }), // just passed
];

describe("order", () => {
  it("saved: upcoming deadlines soonest first, then none, then passed (latest first); then newest applied (none last)", () => {
    expect([...ROWS].sort(applicationOrder(TODAY)).map((r) => r.company)).toEqual([
      "Quarry",
      "Halcyon",
      "Orchard",
      "Lakeshore",
      "Larkspur",
      "Northwind",
      "Kestrel",
      "Brightline",
      "Tidewater",
      "Maple",
    ]);
  });
});

describe("filterApplications", () => {
  it("counts the tiles: sent is everything not saved, in process is OA + interviewing, offers", () => {
    expect(filterApplications(ROWS, "", "all", TODAY).tiles).toEqual({ sent: 5, in_process: 2, offers: 1 });
  });
  it("a tile filters to its statuses; counts follow the search", () => {
    expect(filterApplications(ROWS, "", "in_process", TODAY).visible.map((r) => r.company)).toEqual(["Northwind", "Kestrel"]);
    const { visible, counts, tiles } = filterApplications(ROWS, "kestrel", "all", TODAY);
    expect(visible.map((r) => r.company)).toEqual(["Kestrel"]);
    expect(counts.interviewing).toBe(1);
    expect(tiles).toEqual({ sent: 1, in_process: 1, offers: 0 });
  });
  it("parses the filter from the address; anything unknown (even an object key) is all", () => {
    expect(parseStatusFilter("offer")).toBe("offer");
    expect(parseStatusFilter("sent")).toBe("sent");
    expect(parseStatusFilter("toString")).toBe("all");
    expect(parseStatusFilter("constructor")).toBe("all");
    expect(inFilter("withdrawn", "sent")).toBe(true);
    expect(inFilter("saved", "sent")).toBe(false);
  });
});

describe("statusChange", () => {
  it("leaving saved dates it today if it had no date; nothing else changes dates", () => {
    expect(statusChange({ status: "saved", applied_on: null }, "applied", TODAY)).toEqual({ status: "applied", applied_on: TODAY });
    expect(statusChange({ status: "saved", applied_on: "2026-11-01" }, "applied", TODAY)).toEqual({ status: "applied" });
    expect(statusChange({ status: "applied", applied_on: null }, "rejected", TODAY)).toEqual({ status: "rejected" });
    expect(statusChange({ status: "applied", applied_on: "2026-11-01" }, "saved", TODAY)).toEqual({ status: "saved" });
  });
});

describe("rowDate", () => {
  it.each([
    [{ status: "applied", applied_on: "2026-11-03", deadline: null }, { text: "Applied Nov 3", tone: "muted" }],
    [{ status: "interviewing", applied_on: null, deadline: "2026-12-01" }, null],
    [{ status: "saved", applied_on: null, deadline: "2026-12-01" }, { text: "Deadline Dec 1", tone: "muted" }],
    [{ status: "saved", applied_on: null, deadline: TODAY }, { text: "Deadline today", tone: "ink" }],
    [{ status: "saved", applied_on: null, deadline: "2026-11-01" }, { text: "Deadline passed", tone: "danger" }],
    [{ status: "saved", applied_on: null, deadline: null }, null],
  ] as const)("%o → %o", (row, expected) => {
    expect(rowDate(row, TODAY)).toEqual(expected);
  });
});

describe("statusTone", () => {
  it("is never red: rejected and withdrawn are muted", () => {
    expect(["saved", "rejected", "withdrawn"].map((s) => statusTone(s as never))).toEqual(["muted", "muted", "muted"]);
    expect(statusTone("interviewing")).toBe("accent");
  });
});
