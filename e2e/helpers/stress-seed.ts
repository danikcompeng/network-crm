// A stress version of the demo (plans/crm.md, Feature 6): the sample
// network plus content at the database's limits (an 80-character name and
// company and role, a 4,000-character note, 200 interactions with a
// 1,000-character note, a 120-character application role, a 2,000-character
// link), one name that is a single unbroken token (an email address), and
// an introduction chain six deep. For screenshots only; the samples are put
// back afterwards.
import { addDays } from "../../lib/dates";
import { demoSeedPayload, type SeedPayload } from "../../lib/demo-seed";

const filler = (length: number, words: string) => {
  let text = "";
  while (text.length < length) text += (text ? " " : "") + words;
  return text.slice(0, length).trimEnd();
};

export function stressSeedPayload(today: string, timeZone: string | undefined): SeedPayload {
  const base = demoSeedPayload(today, timeZone);
  const at = (day: string) => `${day}T16:00:00.000Z`;
  const longName = filler(80, "Maximiliana Alexandrovna Featherstonehaugh-Montgomery");
  // No hyphens or dots to break at: the browser can only wrap it anywhere.
  const unbroken = "alexandriafeatherstonehaughmontgomery@extraordinarilylongdomainexample";
  const token = "https://careers.example.com/" + "x".repeat(120);
  const contacts: SeedPayload["contacts"] = [
    {
      key: "stress-long",
      name: longName,
      company: filler(80, "International Consolidated Engineering Research Laboratories"),
      role: filler(80, "Senior Principal Distinguished Engineering Recruiting Partner"),
      how_met: filler(280, "Met at the career fair after the robotics panel"),
      met_on: addDays(today, -220),
      introduced_by: null,
      stage: "interviewing",
      next_follow_up: today,
      notes: (() => {
        const tail = ` ${unbroken} ${token}`;
        return filler(4_000 - tail.length, "Talked about the firmware team, the spring cohort and what the interviews look like.").padEnd(4_000 - tail.length, ".") + tail;
      })(),
      created_at: at(addDays(today, -220)),
    },
    {
      key: "stress-email",
      name: unbroken.slice(0, 80),
      company: null,
      role: null,
      how_met: null,
      met_on: addDays(today, -30),
      introduced_by: "stress-long",
      stage: "new",
      next_follow_up: addDays(today, -3),
      notes: null,
      created_at: at(addDays(today, -30)),
    },
  ];
  // A chain six deep under the long-named contact.
  for (let i = 1; i <= 6; i++) {
    contacts.push({
      key: `stress-chain-${i}`,
      name: `Chain Person Number ${i} With A Fairly Long Name`,
      company: "Deep Chain Co",
      role: null,
      how_met: null,
      met_on: addDays(today, -200 + i * 10),
      introduced_by: i === 1 ? "stress-long" : `stress-chain-${i - 1}`,
      stage: "talking",
      next_follow_up: null,
      notes: null,
      created_at: at(addDays(today, -200 + i * 10)),
    });
  }
  const kinds = ["call", "message", "email", "meeting", "other"] as const;
  const interactions: SeedPayload["interactions"] = Array.from({ length: 200 }, (_, i) => {
    const day = addDays(today, -1 - i);
    return {
      contact: "stress-long",
      day,
      kind: kinds[i % kinds.length],
      note: i === 0 ? filler(1_000 - token.length - 1, "Long call about the team, the projects, the interview loop and the timeline.") + " " + token : `Check-in ${i + 1}`,
      created_at: at(day),
    };
  });
  const applications: SeedPayload["applications"] = [
    {
      company: filler(80, "International Consolidated Engineering Research Laboratories"),
      role: filler(120, "Embedded Firmware and Robotics Perception Software Engineering Intern (Summer)"),
      status: "interviewing",
      applied_on: addDays(today, -12),
      deadline: addDays(today, 2),
      contact: "stress-long",
      location: filler(80, "Toronto, Ontario, Canada (Hybrid)"),
      link: "https://careers.example.com/" + "a".repeat(2_000 - "https://careers.example.com/".length),
      notes: filler(2_000, "Second round booked. Prepare the systems design question and the firmware project."),
      created_at: at(addDays(today, -12)),
    },
  ];
  return {
    contacts: [...base.contacts, ...contacts],
    interactions: [...base.interactions, ...interactions],
    applications: [...base.applications, ...applications],
  };
}
