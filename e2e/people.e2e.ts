// People (plans/crm.md, Feature 2), on the real demo account. Each test
// starts from fresh samples, and the shared demo is put back at the end.
import { expect, test, type Page } from "@playwright/test";
import { expectNoA11yViolations, freshDemo } from "./helpers/app";
import { demoClient, reseedDemo } from "./helpers/seed";

test.afterAll(async () => {
  await reseedDemo();
});

const rows = (page: Page) => page.getByRole("main").getByRole("listitem");

async function openPerson(page: Page, name: string) {
  await page.getByRole("link", { name: new RegExp(`^${name}`) }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("the list: everyone, search by company and word order, stage filter, kept in the address", async ({ page }) => {
  await freshDemo(page, "/people");
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await expect(rows(page)).toHaveCount(20);
  await expect(page.getByRole("button", { name: "All 20" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("searchbox", { name: "Search people" }).fill("kestrel");
  await expect(rows(page)).toHaveCount(4); // Sam, Riya, Tom, Mei
  await page.getByRole("searchbox", { name: "Search people" }).fill("okafor  KESTREL");
  await expect(rows(page)).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search people" }).fill("kestrel");
  await page.getByRole("button", { name: /^Interviewing/ }).click();
  await expect(rows(page)).toHaveCount(1);
  await expect(page).toHaveURL(/q=kestrel/);
  await expect(page).toHaveURL(/stage=interviewing/);

  // Back from a person returns to the same filtered list.
  await openPerson(page, "Riya Patel");
  await page.goBack();
  await expect(page.getByRole("searchbox", { name: "Search people" })).toHaveValue("kestrel");
  await expect(rows(page)).toHaveCount(1);

  await page.getByRole("searchbox", { name: "Search people" }).fill("nobody like this");
  await expect(page.getByText(/No one matches/)).toBeVisible();
  await page.getByRole("button", { name: "Show everyone" }).click();
  await expect(rows(page)).toHaveCount(20);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoA11yViolations(page);
  }
});

test("a person's page: follow-up, the whole chain, who they introduced, the timeline", async ({ page }) => {
  await freshDemo(page, "/people");
  await openPerson(page, "Riya Patel");
  await expect(page.getByRole("region", { name: "Next follow-up" })).toContainText("Today");
  const how = page.getByRole("region", { name: "How you know them" });
  // "→" on screen; screen readers hear ", then ".
  await expect(how.getByRole("list", { name: "Introduction chain" }).getByRole("listitem")).toHaveText(["Elena Marsh", "Sam Okafor", "Riya Patel"]);
  await expect(page.getByRole("heading", { name: "Introduced you to 1 person" })).toBeVisible();
  await expect(page.getByText("Technical interview on site")).toBeVisible();
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoA11yViolations(page);
  }

  // Follow the chain up.
  await page.getByRole("link", { name: "Sam Okafor" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Sam Okafor" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Next follow-up" })).toContainText(/days? overdue/);
});

test("add a person through an introducer, edit them, then delete them", async ({ page }) => {
  await freshDemo(page, "/people");
  await page.getByRole("button", { name: "Add" }).click();
  const sheet = page.getByRole("dialog", { name: "Add a person" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Add person" }).click();
  await expect(sheet.getByText("Give them a name.")).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: "Name" })).toBeFocused();

  await sheet.getByRole("textbox", { name: "Name" }).fill("Priya Shah");
  await sheet.getByRole("textbox", { name: "Company (optional)" }).fill("Kestrel Systems");
  await sheet.getByRole("combobox", { name: "Introduced by" }).selectOption({ label: "Sam Okafor · Kestrel Systems" });
  await sheet.getByRole("button", { name: "Add person" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Priya Shah" })).toBeVisible();
  await expect(page.getByRole("region", { name: "How you know them" })).toContainText("Introduced through");

  // Back goes to the list, and Add opens empty (never the last person's values).
  await page.goBack();
  await expect(page.getByRole("link", { name: /^Priya Shah/ })).toBeVisible();
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("dialog", { name: "Add a person" }).getByRole("textbox", { name: "Name" })).toHaveValue("");
  await page.getByRole("dialog", { name: "Add a person" }).getByRole("button", { name: "Cancel" }).click();

  // Edit: the stage changes in place.
  await openPerson(page, "Priya Shah");
  await page.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: "Edit Priya Shah" });
  await edit.getByRole("combobox", { name: "Stage" }).selectOption("Talking");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  // (Hidden pages stay in the DOM under <Activity>, so look inside this person's header.)
  await expect(page.locator("header").filter({ hasText: "Priya Shah" }).getByText("Talking", { exact: true })).toBeVisible();

  // Delete, with the confirmation saying what happens.
  await page.getByRole("button", { name: "Edit" }).click();
  await edit.getByRole("button", { name: "Delete Priya Shah" }).click();
  await expect(edit.getByText("Delete Priya Shah?")).toBeVisible();
  await expect(edit.getByText("Nothing else is affected.")).toBeVisible();
  await edit.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page).toHaveURL(/\/people$/);
  await expect(page.getByRole("status").filter({ hasText: "Deleted Priya Shah." })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Priya Shah/ })).toHaveCount(0);
});

test("the introducer list leaves out the person and everyone below them", async ({ page }) => {
  await freshDemo(page, "/people");
  await openPerson(page, "Elena Marsh");
  await page.getByRole("button", { name: "Edit" }).click();
  const options = page.getByRole("dialog", { name: "Edit Elena Marsh" }).getByRole("combobox", { name: "Introduced by" }).getByRole("option");
  const labels = await options.allTextContents();
  for (const below of ["Elena Marsh", "Sam Okafor", "Riya Patel", "Tom Becker", "Grace Liu", "Victor Alvarez"]) {
    expect(labels.some((l) => l.startsWith(below)), below).toBe(false);
  }
  expect(labels.some((l) => l.startsWith("Marcus Reid"))).toBe(true);
});

test("a save from a stale sheet is refused, never written over newer data", async ({ page }) => {
  await freshDemo(page, "/people");
  await openPerson(page, "Ana Torres");
  await page.getByRole("button", { name: "Edit" }).click();
  // Meanwhile, somewhere else, Ana's role changes.
  const supabase = await demoClient();
  const { error } = await supabase.from("crm_contacts").update({ role: "Controls Lead" }).eq("name", "Ana Torres");
  expect(error).toBeNull();
  const edit = page.getByRole("dialog", { name: "Edit Ana Torres" });
  await edit.getByRole("textbox", { name: "Role (optional)" }).fill("Intern");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit.getByText(/changed somewhere else/)).toBeVisible();
  // The refusal refreshes the page behind the sheet; a second Save must still be refused.
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit.getByText(/changed somewhere else/)).toBeVisible();
  const { data } = await supabase.from("crm_contacts").select("role").eq("name", "Ana Torres").single();
  expect(data?.role).toBe("Controls Lead");
});

test("an unknown person says so, with a way back", async ({ page }) => {
  await freshDemo(page, "/people/00000000-0000-4000-8000-000000000000");
  await expect(page.getByRole("heading", { name: "Not in your network" })).toBeVisible();
  await page.goto("/people/not-an-id");
  await expect(page.getByRole("heading", { name: "Not in your network" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
});
