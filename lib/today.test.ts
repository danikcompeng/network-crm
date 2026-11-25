import { describe, expect, it } from "vitest";
import { buildToday, comingUpDay, dueBadge, initials, lastContact, longDay, nextHint, type TodayPerson } from "./today";

const TODAY = "2026-11-24";
let n = 0;
const person = (name: string, next_follow_up: string | null, extra: Partial<TodayPerson> = {}): TodayPerson => ({
  id: `p${++n}`,
  name,
  company: null,
  role: null,
  how_met: null,
  stage: "talking",
  next_follow_up,
  last_day: null,
  ...extra,
});

const PEOPLE = [
  person("Riya", "2026-11-24"),
  person("Isabel", "2026-11-15"), // 9 days overdue
  person("Sam", "2026-11-22"),
  person("Ben", "2026-11-24"),
  person("Victor", "2026-11-25"), // tomorrow
  person("Ana", "2026-12-01"), // today + 7: coming up
  person("Kofi", "2026-12-02"), // today + 8: later
  person("Ethan", "2027-01-08", { stage: "parked" }),
  person("Leo", null),
];

describe("buildToday", () => {
  const view = buildToday(PEOPLE, TODAY);
  it("follow up = overdue and today, most overdue first, then by name", () => {
    expect(view.followUp.map((p) => p.name)).toEqual(["Isabel", "Sam", "Ben", "Riya"]);
  });
  it("coming up = today + 1 … today + 7, soonest first", () => {
    expect(view.comingUp.map((p) => p.name)).toEqual(["Victor", "Ana"]);
  });
  it("the next one after that is the hint for an empty day", () => {
    expect(view.next?.name).toBe("Kofi");
    expect(nextHint(view.next, TODAY)).toBe("Next: Kofi, Dec 2");
    expect(view.anyFollowUps).toBe(true);
  });
  it("parked people with a due follow-up still show (it's their explicit ask)", () => {
    const v = buildToday([person("Parked", "2026-11-20", { stage: "parked" })], TODAY);
    expect(v.followUp).toHaveLength(1);
  });
  it("nobody with a follow-up", () => {
    expect(buildToday([person("Leo", null)], TODAY)).toEqual({ followUp: [], comingUp: [], next: null, anyFollowUps: false });
  });
});

describe("words", () => {
  it.each([
    ["2026-11-24", { text: "Today", overdue: false }],
    ["2026-11-23", { text: "1 day overdue", overdue: true }],
    ["2026-11-15", { text: "9 days overdue", overdue: true }],
  ])("due badge for %s", (day, badge) => {
    expect(dueBadge(day, TODAY)).toEqual(badge);
  });

  it.each([
    [null, "No contact yet"],
    ["2026-11-24", "Last contact today"],
    ["2026-11-23", "Last contact yesterday"],
    ["2026-11-01", "Last contact 23 days ago"],
    ["2026-11-25", "Last contact today"],
  ])("last contact %s → %s", (day, words) => {
    expect(lastContact(day, TODAY)).toBe(words);
  });

  it("coming-up days and the long date", () => {
    expect(comingUpDay("2026-11-25", TODAY)).toBe("Tomorrow");
    expect(comingUpDay("2026-11-27", TODAY)).toBe("Fri, Nov 27");
    expect(longDay(TODAY)).toBe("Tuesday, November 24");
  });

  it.each([
    ["Riya Patel", "RP"],
    ["José Álvarez", "JÁ"],
    ["Leo", "L"],
    ["  mary   anne  smith ", "MS"],
    ["🙂 Happy", "🙂H"],
    ["🇨🇦 Dana", "🇨🇦D"],
    ["👩‍💻 Sam", "👩‍💻S"],
    ["", "?"],
  ])("initials(%s) → %s", (name, letters) => {
    expect(initials(name)).toBe(letters);
  });
});
