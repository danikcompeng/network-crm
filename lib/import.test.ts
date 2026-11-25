import { describe, expect, it } from "vitest";
import {
  MAX_IMPORT_ROWS,
  decideSlashOrder,
  detectDelimiter,
  duplicateIndex,
  headerField,
  isDuplicate,
  parseRows,
  previewImport,
  previewSummary,
  readColumns,
  readDate,
  readStatus,
  tidyLink,
} from "./import";

const TODAY = "2026-11-24";
const opts = { today: TODAY, room: 1000 };

describe("parseRows", () => {
  it("reads a spreadsheet copy (tabs) and a CSV (commas)", () => {
    expect(detectDelimiter("Company\tRole\nA\tB")).toBe("\t");
    expect(detectDelimiter("Company,Role\nA,B")).toBe(",");
    expect(parseRows("A\tB\tC\nD\tE\tF")).toEqual([
      ["A", "B", "C"],
      ["D", "E", "F"],
    ]);
  });

  it("handles quoted commas, doubled quotes and line breaks inside quotes", () => {
    const csv = 'Company,Role,Notes\n"Kestrel, Inc.",Firmware Intern,"Said ""soon""\nthen nothing"\n';
    expect(parseRows(csv)).toEqual([
      ["Company", "Role", "Notes"],
      ["Kestrel, Inc.", "Firmware Intern", 'Said "soon"\nthen nothing'],
    ]);
  });

  it("in tab-separated text, a quote that doesn't close a cell is just text (it never swallows later rows)", () => {
    expect(parseRows('Kestrel\t"Rockstar" Intern\tApplied\nHalcyon\tHardware Intern\tSaved')).toEqual([
      ["Kestrel", '"Rockstar" Intern', "Applied"],
      ["Halcyon", "Hardware Intern", "Saved"],
    ]);
    // A real quoted cell (a spreadsheet's line break) still works.
    expect(parseRows('Kestrel\t"Line one\nline two"\tApplied')).toEqual([["Kestrel", "Line one\nline two", "Applied"]]);
  });

  it("handles CRLF, a BOM, blank lines and a missing final newline", () => {
    expect(parseRows("\uFEFFA,B\r\n\r\nC,D\r\n,\r\nE,F")).toEqual([
      ["A", "B"],
      ["C", "D"],
      ["E", "F"],
    ]);
  });

  it("keeps empty cells in place (a ragged row stays ragged)", () => {
    expect(parseRows("A,,C\nD")).toEqual([["A", "", "C"], ["D"]]);
  });
});

describe("columns", () => {
  it.each([
    ["Company Name", "company"],
    ["Employer", "company"],
    ["Position Title", "role"],
    ["Job Title", "role"],
    ["Date Applied", "applied_on"],
    ["Applied On", "applied_on"],
    ["Job Link", "link"],
    ["URL", "link"],
    ["Application Status", "status"],
    ["City", "location"],
    ["Comments", "notes"],
    ["Closing date", "deadline"],
    ["Salary", null],
  ])("header %s → %s", (cell, field) => {
    expect(headerField(cell)).toBe(field);
  });

  it("a header row names both a company and a role; each field is taken once", () => {
    expect(readColumns(["Company Name", "Position Title", "Location", "Date Applied", "Status", "Job Link", "Salary"])).toEqual({
      fromHeader: true,
      fields: ["company", "role", "location", "applied_on", "status", "link", null],
    });
  });

  it("otherwise the first row is data, read in the default order", () => {
    expect(readColumns(["Kestrel", "Firmware Intern", "2026-11-03"])).toEqual({
      fromHeader: false,
      fields: ["company", "role", "applied_on"],
    });
    expect(readColumns(["Status Labs", "Applied Scientist Intern"]).fromHeader).toBe(false);
    // Long cells, or cells with digits, are data, not headers.
    expect(readColumns(["Business Development Bank of Canada", "Software Developer Internship"]).fromHeader).toBe(false);
    expect(readColumns(["Company 2026", "Role"]).fromHeader).toBe(false);
  });
});

describe("readStatus", () => {
  it.each([
    ["", "applied", true],
    ["Applied", "applied", true],
    ["submitted", "applied", true],
    ["No response", "applied", true],
    ["No response yet", "applied", true],
    ["Online assessment", "online_assessment", true],
    ["online_assessment", "online_assessment", true],
    ["HackerRank sent", "online_assessment", true],
    ["OA", "online_assessment", true],
    ["Phone screen - 11/20", "interviewing", true],
    ["Interview scheduled", "interviewing", true],
    ["Interview 2", "interviewing", true],
    ["Offer!", "offer", true],
    ["No offer", "rejected", true],
    ["Not interviewing", "rejected", true],
    ["Rejected after interview", "rejected", true],
    ["Rejected (after OA)", "rejected", true],
    ["Declined", "rejected", true],
    ["Declined offer", "withdrawn", true],
    ["Withdrew", "withdrawn", true],
    ["To apply", "saved", true],
    ["Not applied", "saved", true],
    ["Not applied yet", "saved", true],
    ["Haven't applied", "saved", true],
    ["Not accepted", "rejected", true],
    ["Did not get an interview", "rejected", true],
    ["Failed OA", "rejected", true],
    ["OA failed", "rejected", true],
    ["Offer rescinded", "rejected", true],
    ["Offer declined", "withdrawn", true],
    ["No longer interested", "withdrawn", true],
    ["maybe?", "applied", false],
  ])("%s → %s", (raw, status, known) => {
    expect(readStatus(raw)).toEqual({ status, known });
  });
});

describe("dates", () => {
  it("decides one day/month order for the whole paste, by the evidence", () => {
    expect(decideSlashOrder(["11/03/2026", "11/24/2026"])).toEqual({ order: "month-first", forced: true });
    expect(decideSlashOrder(["03/11/2026", "24/11/2026"])).toEqual({ order: "day-first", forced: true });
    expect(decideSlashOrder(["03/11/2026", "04/11/2026"])).toEqual({ order: "month-first", forced: false });
    expect(decideSlashOrder(["24/11/2026", "25/11/2026", "11/24/2026"])).toEqual({ order: "day-first", forced: true });
  });

  it.each([
    ["2026-11-24", "month-first", "2026-11-24"],
    ["2026/11/24", "month-first", "2026-11-24"],
    ["2026-11-24 14:03:00", "month-first", "2026-11-24"],
    ["11/24/2026", "month-first", "2026-11-24"],
    ["24/11/2026", "day-first", "2026-11-24"],
    ["3/4/26", "month-first", "2026-03-04"],
    ["3/4/26", "day-first", "2026-04-03"],
    ["Nov 24, 2026", "month-first", "2026-11-24"],
    ["November 24 2026", "month-first", "2026-11-24"],
    ["Monday, November 24, 2026", "month-first", "2026-11-24"],
    ["Sept 3, 2026", "month-first", "2026-09-03"],
    ["Nov 3rd, 2026", "month-first", "2026-11-03"],
    ["24 Nov 2026", "month-first", "2026-11-24"],
    ["24-Nov-26", "month-first", "2026-11-24"],
    ["46350", "month-first", "2026-11-24"], // Excel serial
  ] as const)("%s (%s) → %s", (raw, order, day) => {
    expect(readDate(raw, order, TODAY, "past")).toEqual({ day });
  });

  it("no year: applied dates lean into the past, deadlines into the future", () => {
    expect(readDate("Nov 3", "month-first", TODAY, "past")).toEqual({ day: "2026-11-03" });
    expect(readDate("Dec 3", "month-first", TODAY, "past")).toEqual({ day: "2025-12-03" });
    expect(readDate("Nov 3", "month-first", TODAY, "next")).toEqual({ day: "2027-11-03" });
    expect(readDate("Dec 3", "month-first", TODAY, "next")).toEqual({ day: "2026-12-03" });
  });

  it("empty is empty; nonsense and contradictions are errors in words", () => {
    expect(readDate("", "month-first", TODAY, "past")).toEqual({ empty: true });
    for (const raw of ["2026-02-30", "13/13/2026", "soon", "Smarch 3"]) {
      expect(readDate(raw, "month-first", TODAY, "past")).toHaveProperty("error");
    }
    expect(readDate("24/11/2026", "month-first", TODAY, "past")).toEqual({ error: "reads day/month, unlike the other dates" });
  });
});

describe("tidyLink", () => {
  it.each([
    ["https://jobs.example.com/123?a=b", "https://jobs.example.com/123?a=b"],
    ["HTTP://X.example/Path", "http://x.example/Path"],
    ["www.kestrel.example/careers", "https://www.kestrel.example/careers"],
    ["kestrel.example", "https://kestrel.example/"],
    ["https://jobs.example.com/café", "https://jobs.example.com/caf%C3%A9"],
    ["", null],
    ["javascript:alert(1)", undefined],
    ["data:text/html,hi", undefined],
    ["see email", undefined],
    ["https://exa mple.com", undefined],
    ["https://jobs.example.com\u00A0(closed)", undefined],
  ] as const)("%s → %s", (raw, link) => {
    expect(tidyLink(raw)).toBe(link);
  });
});

describe("duplicates", () => {
  const index = duplicateIndex([
    { company: "Kestrel Systems", role: "Firmware Intern", applied_on: "2026-11-03" },
    { company: "Orchard Pay", role: "Platform Intern", applied_on: null },
  ]);
  it("same company and role (folded) and the same or an unknown date", () => {
    expect(isDuplicate({ company: "kestrel  systems", role: "FIRMWARE INTERN", applied_on: "2026-11-03" }, index)).toBe(true);
    expect(isDuplicate({ company: "Kestrel Systems", role: "Firmware Intern", applied_on: null }, index)).toBe(true);
    expect(isDuplicate({ company: "Orchard Pay", role: "Platform Intern", applied_on: "2026-01-05" }, index)).toBe(true);
  });
  it("the same role in another season isn't a duplicate", () => {
    expect(isDuplicate({ company: "Kestrel Systems", role: "Firmware Intern", applied_on: "2026-03-01" }, index)).toBe(false);
  });
});

describe("previewImport", () => {
  const sheet = [
    "Company\tRole\tDate applied\tStatus\tLink",
    "Kestrel Systems\tFirmware Intern\t11/03/2026\tInterview\twww.kestrel.example/jobs/1",
    "Halcyon Labs\tHardware Intern\t11/24/2026\tmaybe?\tjavascript:alert(1)",
    "Northwind Robotics\t\t11/05/2026\tApplied\t",
    "kestrel  systems\tFIRMWARE INTERN\t11/03/2026\tApplied\t",
    "Tidewater Analytics\tData Intern\t2/30/2026\tApplied\t",
    "Orchard Pay\tPlatform Intern\t\tSaved\t",
  ].join("\n");
  const existing = [{ company: "Orchard Pay", role: "Platform Intern", applied_on: null }];
  const preview = previewImport(sheet, existing, opts);

  it("reads headers, values and the date order", () => {
    expect(preview.columns.fromHeader).toBe(true);
    expect(preview.header).toEqual(["Company", "Role", "Date applied", "Status", "Link"]);
    expect(preview.dateOrder).toBe("month-first");
    expect(preview.dateOrderForced).toBe(true);
    expect(preview.rows[0]).toMatchObject({
      line: 2,
      value: {
        company: "Kestrel Systems",
        role: "Firmware Intern",
        status: "interviewing",
        applied_on: "2026-11-03",
        link: "https://www.kestrel.example/jobs/1",
      },
      problems: [],
      included: true,
    });
  });

  it("says what it read loosely, keeps an unknown status in the notes, never keeps a non-web link", () => {
    expect(preview.rows[1].value).toMatchObject({ status: "applied", link: null, notes: "Status in the sheet: maybe?" });
    expect(preview.rows[1].notes).toEqual([
      "Status “maybe?” read as Applied (kept in the notes).",
      "Link “javascript:alert(1)” left out: not a web address.",
    ]);
  });

  it("flags problems in words, and holds back duplicates (in the paste and already saved)", () => {
    expect(preview.rows[2].problems).toEqual(["No role."]);
    expect(preview.rows[3]).toMatchObject({ duplicate: true, duplicateOf: "Also on row 2.", included: false });
    expect(preview.rows[4].problems).toEqual(["Applied date “2/30/2026” isn’t a date this can read."]);
    expect(preview.rows[5]).toMatchObject({ duplicate: true, duplicateOf: "Already in your list.", included: false });
    expect(preview.counts).toEqual({ ready: 2, duplicates: 2, problems: 2 });
    expect(preview.ready.map((a) => a.company)).toEqual(["Kestrel Systems", "Halcyon Labs"]);
    expect(previewSummary(preview.counts)).toBe("2 to import · 2 already in your list · 2 with problems");
  });

  it("'Import anyway' includes a duplicate", () => {
    const p = previewImport(sheet, existing, { ...opts, includeDuplicates: new Set([7]) });
    expect(p.rows[5]).toMatchObject({ duplicate: true, included: true });
    expect(p.counts).toMatchObject({ ready: 3, duplicates: 1 });
  });

  it("the column picker replaces what was read", () => {
    const p = previewImport("Kestrel,Toronto,Firmware Intern", [], { ...opts, fields: ["company", "location", "role"] });
    expect(p.ready).toEqual([expect.objectContaining({ company: "Kestrel", role: "Firmware Intern", location: "Toronto" })]);
  });

  it("when the dates don't decide, the switch does", () => {
    const text = "Company,Role,Applied\nA,R,03/04/2026";
    expect(previewImport(text, [], opts)).toMatchObject({ dateOrderForced: false, dateOrder: "month-first" });
    expect(previewImport(text, [], opts).ready[0].applied_on).toBe("2026-03-04");
    expect(previewImport(text, [], { ...opts, dateOrder: "day-first" }).ready[0].applied_on).toBe("2026-04-03");
  });

  it("row numbers are the spreadsheet's, after a blank row and a cell with a line break", () => {
    const p = previewImport('Company,Role,Notes\nA,R1,\n\nB,R2,"two\nlines"\nC,R3,', [], opts);
    expect(p.rows.map((r) => r.line)).toEqual([2, 4, 6]);
  });

  it("a repeat within the paste says which row it repeats", () => {
    const p = previewImport("Company,Role\nKestrel,Intern\nOther,Role\nkestrel,INTERN", [], opts);
    expect(p.rows[2]).toMatchObject({ duplicate: true, duplicateOf: "Also on row 2.", included: false });
    expect(p.rows[0]).toMatchObject({ duplicate: false, duplicateOf: null });
  });

  it("without headers, reads the default order and keeps the first row", () => {
    const p = previewImport("Kestrel,Firmware Intern,2026-11-03,applied", [], opts);
    expect(p.columns.fromHeader).toBe(false);
    expect(p.ready).toHaveLength(1);
    expect(p.rows[0].line).toBe(1);
  });

  it("blocks with a reason: nothing pasted, only headers, no company column, too many rows, no room", () => {
    expect(previewImport("  \n ", [], opts).blocked).toMatch(/Paste some rows/);
    expect(previewImport("Company,Role", [], opts).blocked).toMatch(/only a header row/);
    expect(previewImport("Company,Role\nA,B", [], { ...opts, fields: ["company", null] }).blocked).toMatch(/company and which is the role/);
    const many = ["Company,Role", ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `C${i},R${i}`)].join("\n");
    expect(previewImport(many, [], opts).blocked).toMatch(/up to 500/);
    expect(previewImport("Company,Role\nA,B\nC,D", [], { ...opts, room: 1 }).blocked).toMatch(/room for 1 more/);
  });

  it("the minority of slash dates that read the other way are problems", () => {
    const p = previewImport("Company,Role,Applied\nA,R1,24/11/2026\nB,R2,25/11/2025\nC,R3,11/24/2026", [], opts);
    expect(p.dateOrder).toBe("day-first");
    expect(p.rows.map((r) => r.problems.length)).toEqual([0, 0, 1]);
  });

  it("dates outside 2000-2100, and an applied date after today, are problems", () => {
    expect(previewImport("Company,Role,Applied\nA,R,1999-12-31", [], opts).rows[0].problems).toEqual([
      "Applied date 1999-12-31 is outside 2000 to 2100.",
    ]);
    expect(previewImport("Company,Role,Applied\nA,R,2026-11-25", [], opts).rows[0].problems).toEqual([
      "Applied date 2026-11-25 is in the future.",
    ]);
  });
});
