// Today, logging and follow-ups (plans/crm.md, Feature 4), on the real demo
// account. Each test starts from fresh samples; the demo is put back at the end.
import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations, freshDemo } from "./helpers/app";
import { reseedDemo } from "./helpers/seed";

test.afterAll(async () => {
  await reseedDemo();
});

const followUp = (page: Page) => page.getByRole("region", { name: "Follow up" });
const comingUp = (page: Page) => page.getByRole("region", { name: "Coming up" });

test("Today: who's due (most overdue first), who's coming up, the tiles", async ({ page }) => {
  await freshDemo(page);
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();
  await expect(followUp(page).getByText("6 due")).toBeVisible();
  await expect(followUp(page).getByRole("article")).toHaveText([
    /Isabel Cruz/,
    /Marcus Reid/,
    /Sam Okafor/,
    /Hana Kim/,
    /Ben Foster/,
    /Riya Patel/,
  ]);
  await expect(followUp(page).getByText("9 days overdue")).toBeVisible();
  await expect(comingUp(page).getByRole("listitem")).toHaveCount(7);
  await expect(comingUp(page).getByText("Tomorrow")).toBeVisible();
  await expect(page.getByRole("link", { name: "12 Sent" })).toBeVisible();

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoA11yViolations(page);
  }
});

test("log in two taps: the card leaves, the sheet stays, the next follow-up lands under Coming up", async ({ page }) => {
  await freshDemo(page);
  await page.getByRole("button", { name: "Log contact with Riya Patel" }).click();
  await page.getByRole("dialog", { name: "Log contact with Riya Patel" }).getByRole("button", { name: "Call" }).click();

  const logged = page.getByRole("dialog", { name: "Riya Patel" });
  await expect(logged.getByRole("status")).toContainText("Logged a call with Riya Patel.");
  // Her follow-up was cleared: she's gone from Follow up while the sheet stays open.
  await expect(followUp(page).getByText("5 due")).toBeVisible();
  await expect(logged.getByText(/Their .* follow-up is done/)).toBeVisible();

  await logged.getByRole("button", { name: "Set follow-up" }).click();
  await expect(logged.getByText(/^Next follow-up: /)).toBeVisible();
  await logged.getByRole("button", { name: "Done" }).click();
  await expect(comingUp(page).getByRole("button", { name: /^Riya Patel/ })).toBeVisible();
});

test("Undo after setting the follow-up takes back both: due today again", async ({ page }) => {
  await freshDemo(page);
  await page.getByRole("button", { name: "Log contact with Ben Foster" }).click();
  await page.getByRole("dialog", { name: "Log contact with Ben Foster" }).getByRole("button", { name: "Message" }).click();
  const logged = page.getByRole("dialog", { name: "Ben Foster" });
  await logged.getByRole("button", { name: "Set follow-up" }).click();
  await expect(logged.getByText(/^Next follow-up: /)).toBeVisible();
  await logged.getByRole("button", { name: "Undo" }).click();
  await expect(logged).toBeHidden();
  await expect(followUp(page).getByText("6 due")).toBeVisible();
  await expect(followUp(page).getByRole("button", { name: /^Ben Foster/ })).toContainText("Today");
  await expect(comingUp(page).getByRole("button", { name: /^Ben Foster/ })).toHaveCount(0);
});

test("the person sheet: clear a follow-up without logging anything", async ({ page }) => {
  await freshDemo(page);
  await followUp(page).getByRole("button", { name: /^Isabel Cruz/ }).click();
  const sheet = page.getByRole("dialog", { name: "Isabel Cruz" });
  await expect(sheet.getByText("Messaged about her talk on low-power sensors")).toBeVisible();
  await sheet.getByRole("button", { name: "Change" }).click();
  await sheet.getByRole("button", { name: "Clear it" }).click();
  await expect(sheet.getByText("None set")).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(followUp(page).getByText("5 due")).toBeVisible();
});

test("a person's page: log, then delete it from the timeline", async ({ page }) => {
  await freshDemo(page, "/people");
  await page.getByRole("link", { name: /^Hana Kim/ }).click();
  await page.getByRole("button", { name: "Log interaction" }).click();
  const log = page.getByRole("dialog", { name: "Log contact with Hana Kim" });
  await log.getByRole("button", { name: "Add a note or another day" }).click();
  await log.getByRole("textbox", { name: "Note (optional)" }).fill("Asked about the spring cohort");
  await log.getByRole("button", { name: "Email" }).click();
  const logged = page.getByRole("dialog", { name: "Hana Kim" });
  await logged.getByRole("button", { name: "Not now" }).click();
  await logged.getByRole("button", { name: "Done" }).click();

  const timeline = page.getByRole("region", { name: "Timeline" });
  await expect(timeline.getByText("Asked about the spring cohort")).toBeVisible();
  await expect(page.getByRole("region", { name: "Next follow-up" })).toContainText("No follow-up set");

  await timeline.getByRole("button", { name: /^Delete this email from/ }).first().click();
  await expect(timeline.getByText(/may bring back the .* follow-up/)).toBeVisible();
  await timeline.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(timeline.getByText("Asked about the spring cohort")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Next follow-up" })).toContainText("1 day overdue");
});

test("a tile on Today changes the filter of an Applications page kept in the background", async ({ page }) => {
  await freshDemo(page, "/applications");
  await page.getByRole("button", { name: /^Rejected/ }).click();
  await page.getByRole("link", { name: "Today" }).click();
  await page.getByRole("link", { name: "1 Offers" }).click();
  await expect(page.getByRole("button", { name: "1 Offers" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("main").getByRole("list").last().getByRole("listitem")).toHaveCount(1);
});
