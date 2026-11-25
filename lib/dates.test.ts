import { describe, expect, it } from "vitest";
import { addDays, daysBetween, instantOnDay, isValidDay, isValidTimeZone, lastDays, minutesIntoDay, todayIn } from "./dates";

describe("isValidDay", () => {
  it("accepts real days, including leap days", () => {
    expect(isValidDay("2026-11-23")).toBe(true);
    expect(isValidDay("2028-02-29")).toBe(true);
  });
  it("rejects impossible or malformed days", () => {
    for (const bad of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-1-5", "2026-11-23T00:00", "", null, 20261123]) {
      expect(isValidDay(bad)).toBe(false);
    }
  });
});

describe("isValidTimeZone", () => {
  it("knows IANA zones and refuses junk", () => {
    expect(isValidTimeZone("America/Toronto")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
  });
});

describe("todayIn", () => {
  it("is the local day, not the UTC day", () => {
    // 23:30 on Mon 23 Nov in Toronto (UTC-5) is already Tuesday in UTC.
    const now = new Date("2026-11-24T04:30:00Z");
    expect(todayIn("America/Toronto", now)).toBe("2026-11-23");
    expect(todayIn("UTC", now)).toBe("2026-11-24");
  });
  it("handles the far ends of the clock (UTC+14 and UTC-11) around midnight", () => {
    const now = new Date("2026-11-23T10:30:00Z");
    expect(todayIn("Pacific/Kiritimati", now)).toBe("2026-11-24"); // 00:30 next day
    expect(todayIn("Pacific/Pago_Pago", now)).toBe("2026-11-22"); // 23:30 day before
  });
  it("falls back to UTC for a missing or unknown zone", () => {
    const now = new Date("2026-11-24T04:30:00Z");
    expect(todayIn(undefined, now)).toBe("2026-11-24");
    expect(todayIn("Not/AZone", now)).toBe("2026-11-24");
  });
  it("gets the day right across Toronto's DST weekends", () => {
    // Spring forward: 2026-03-08 02:00 -> 03:00. Fall back: 2026-11-01 02:00 -> 01:00.
    expect(todayIn("America/Toronto", new Date("2026-03-08T04:59:00Z"))).toBe("2026-03-07"); // 23:59 EST
    expect(todayIn("America/Toronto", new Date("2026-03-08T05:00:00Z"))).toBe("2026-03-08"); // 00:00 EST
    expect(todayIn("America/Toronto", new Date("2026-11-02T04:59:00Z"))).toBe("2026-11-01"); // 23:59 EST (UTC-5 after fall back)
    expect(todayIn("America/Toronto", new Date("2026-11-02T05:00:00Z"))).toBe("2026-11-02"); // 00:00 EST
  });
});

describe("minutesIntoDay", () => {
  it("counts minutes since local midnight", () => {
    expect(minutesIntoDay("America/Toronto", new Date("2026-11-23T05:09:59Z"))).toBe(9);
    expect(minutesIntoDay("America/Toronto", new Date("2026-11-23T05:10:00Z"))).toBe(10);
    expect(minutesIntoDay("UTC", new Date("2026-11-23T23:59:00Z"))).toBe(1439);
  });
  it("says 0 at midnight, never 24:00", () => {
    expect(minutesIntoDay("UTC", new Date("2026-11-23T00:00:00Z"))).toBe(0);
  });
});

describe("addDays / daysBetween", () => {
  it("crosses month, year and leap-day boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("isn't fooled by DST weekends (every day is one day)", () => {
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(daysBetween("2026-03-07", "2026-03-09")).toBe(2);
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
  });
  it("is negative backwards", () => {
    expect(daysBetween("2026-11-23", "2026-11-20")).toBe(-3);
  });
});

describe("instantOnDay", () => {
  const ZONES = [
    "UTC",
    "America/Toronto",
    "America/Los_Angeles",
    "America/Havana", // DST starts at midnight
    "America/Santiago", // DST starts at midnight
    "America/St_Johns", // -3:30
    "Europe/London",
    "Asia/Kolkata", // +5:30
    "Asia/Kathmandu", // +5:45
    "Australia/Lord_Howe", // 30-minute DST
    "Pacific/Kiritimati", // +14
    "Pacific/Pago_Pago", // -11
  ];

  it("is on the right local day, at local noon, for every day of 2026 in many zones", () => {
    for (const zone of ZONES) {
      for (let d = "2026-01-01"; d <= "2026-12-31"; d = addDays(d, 1)) {
        const t = instantOnDay(d, zone);
        expect(todayIn(zone, t), `${zone} ${d}`).toBe(d);
        expect(minutesIntoDay(zone, t), `${zone} ${d}`).toBe(720);
      }
    }
  });

  it("stays on the same date for viewers up to 11 hours away", () => {
    const t = instantOnDay("2026-11-21", "Europe/London");
    expect(todayIn("America/Toronto", t)).toBe("2026-11-21");
    expect(todayIn("Asia/Tokyo", t)).toBe("2026-11-21");
  });

  it("uses UTC noon when the zone is unknown", () => {
    expect(instantOnDay("2026-11-23", undefined).toISOString()).toBe("2026-11-23T12:00:00.000Z");
  });
});

describe("lastDays", () => {
  it("lists n days ending today, oldest first", () => {
    expect(lastDays("2026-03-02", 3)).toEqual(["2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(lastDays("2026-11-23", 7)).toHaveLength(7);
    expect(lastDays("2026-11-23", 7).at(-1)).toBe("2026-11-23");
  });
});
