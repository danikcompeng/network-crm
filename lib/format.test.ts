import { describe, expect, it } from "vitest";
import { followUpBucket, followUpLabel } from "./follow-up";
import { count, formatDay, formatPastDay, formatWeekday, talkedLabel } from "./format";

describe("formatDay", () => {
  it("leaves out the year when it's this year", () => {
    expect(formatDay("2026-12-09", "2026-11-24")).toBe("Dec 9");
    expect(formatDay("2025-11-24", "2026-11-24")).toBe("Nov 24, 2025");
    expect(formatDay("2027-01-02", "2026-12-30")).toBe("Jan 2, 2027");
  });
  it("never shifts the day, whatever the machine's timezone (formatted in UTC from the string)", () => {
    expect(formatDay("2026-01-01", "2026-06-01")).toBe("Jan 1");
    expect(formatWeekday("2026-11-24")).toBe("Tue, Nov 24");
  });
});

describe("formatPastDay", () => {
  it.each([
    ["2026-11-24", "Today"],
    ["2026-11-23", "Yesterday"],
    ["2026-11-18", "6 days ago"],
    ["2026-11-17", "Nov 17"],
    ["2025-11-30", "Nov 30, 2025"],
  ])("%s → %s", (day, words) => {
    expect(formatPastDay(day, "2026-11-24")).toBe(words);
  });
});

describe("follow-up buckets and words", () => {
  const today = "2026-11-24";
  it.each([
    ["2026-11-01", "overdue", "23 days overdue"],
    ["2026-11-23", "overdue", "1 day overdue"],
    ["2026-11-24", "today", "Today"],
    ["2026-11-25", "soon", "Tomorrow"],
    ["2026-11-29", "soon", "In 5 days"],
    ["2026-12-01", "soon", "In 7 days"], // today + 7: still soon
    ["2026-12-02", "later", "Dec 2"], // today + 8: later
    ["2027-03-01", "later", "Mar 1, 2027"],
  ])("%s is %s (%s)", (day, bucket, label) => {
    expect(followUpBucket(day, today)).toBe(bucket);
    expect(followUpLabel(day, today)).toBe(label);
  });

  it("counts calendar days across a month end, a year end and a DST weekend", () => {
    expect(followUpBucket("2027-01-07", "2026-12-31")).toBe("soon");
    expect(followUpLabel("2027-01-07", "2026-12-31")).toBe("In 7 days");
    expect(followUpLabel("2026-03-09", "2026-03-07")).toBe("In 2 days"); // US DST starts Mar 8
  });
});

describe("count", () => {
  it("is singular only for 1", () => {
    expect(count(0, "person", "people")).toBe("0 people");
    expect(count(1, "person", "people")).toBe("1 person");
    expect(count(2, "person", "people")).toBe("2 people");
  });
});

describe("talkedLabel", () => {
  it.each([
    ["2026-11-24", "Talked today"],
    ["2026-11-23", "Talked yesterday"],
    ["2026-11-21", "Talked 3 days ago"],
    ["2026-11-10", "Talked Nov 10"],
  ])("%s → %s", (day, words) => {
    expect(talkedLabel(day, "2026-11-24")).toBe(words);
  });
});
