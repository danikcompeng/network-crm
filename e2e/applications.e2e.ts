// Applications (plans/crm.md, Feature 3), on the real demo account. Each
// test starts from fresh samples; the shared demo is put back at the end.
import { expect, test, type Page } from "@playwright/test";
import { addDays } from "../lib/dates";
import { expectNoA11yViolations, freshDemo } from "./helpers/app";
import { localToday, reseedDemo } from "./helpers/seed";

test.afterAll(async () => {
  await reseedDemo();
});

const list = (page: Page) => page.getByRole("main").getByRole("list").last();
const rowOpeners = (page: Page) => list(page).getByRole("listitem");

test("tiles, chips and search; the filter stays in the address", async ({ page }) => {
  await freshDemo(page, "/applications");
  await expect(page.getByRole("heading", { name: "Applications" })).toBeVisible();
  await expect(page.getByRole("button", { name: "12 Sent" })).toBeVisible();
  await expect(page.getByRole("button", { name: "5 In process" })).toBeVisible();
  await expect(page.getByRole("button", { name: "1 Offers" })).toBeVisible();
  await expect(rowOpeners(page)).toHaveCount(15);

  await page.getByRole("button", { name: "5 In process" }).click();
  await expect(rowOpeners(page)).toHaveCount(5);
  await expect(page).toHaveURL(/status=in_process/);
  await page.getByRole("button", { name: "5 In process" }).click();
  await expect(rowOpeners(page)).toHaveCount(15);

  await page.getByRole("searchbox", { name: "Search applications" }).fill("northwind");
  await expect(rowOpeners(page)).toHaveCount(2);
  await page.getByRole("button", { name: /^Withdrawn/ }).click();
  await expect(rowOpeners(page)).toHaveCount(1);

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme });
    await expectNoA11yViolations(page);
  }
});

test("a status changes in one tap and stays; leaving Saved dates it today", async ({ page }) => {
  await freshDemo(page, "/applications");
  const harborview = page.getByRole("combobox", { name: "Status of Firmware Intern at Harborview Medical Devices" });
  await harborview.selectOption("interviewing");
  await expect(page.getByRole("status").filter({ hasText: "Saved: Harborview Medical Devices, Interviewing." })).toBeVisible();

  const bluewater = page.getByRole("combobox", { name: "Status of Software Engineering Intern at Bluewater Transit" });
  await bluewater.selectOption("applied");
  await expect(page.getByRole("status").filter({ hasText: "Saved: Bluewater Transit, Applied." })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("combobox", { name: "Status of Firmware Intern at Harborview Medical Devices" })).toHaveValue("interviewing");
  await expect(page.getByRole("button", { name: /^Bluewater Transit/ })).toContainText("Applied");
  await expect(page.getByRole("button", { name: "13 Sent" })).toBeVisible();
});

test("add, edit and delete an application", async ({ page }) => {
  await freshDemo(page, "/applications");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add an application" });
  await add.getByRole("button", { name: "Add application" }).click();
  await expect(add.getByText("Which company?")).toBeVisible();
  await add.getByRole("textbox", { name: "Company" }).fill("Juniper Robotics");
  await add.getByRole("textbox", { name: "Role" }).fill("Perception Intern");
  await add.getByRole("textbox", { name: "Link to the posting (optional)" }).fill("javascript:alert(1)");
  await add.getByRole("button", { name: "Add application" }).click();
  await expect(add.getByText(/isn.t a web address/)).toBeVisible();
  await add.getByRole("textbox", { name: "Link to the posting (optional)" }).fill("juniper.example/jobs/7");
  await add.getByRole("button", { name: "Add application" }).click();
  await expect(add).toBeHidden();

  const row = page.getByRole("button", { name: /^Juniper Robotics/ });
  await expect(row).toBeVisible();
  await expect(page.getByRole("link", { name: /^Posting for Perception Intern at Juniper Robotics/ })).toHaveAttribute(
    "href",
    "https://juniper.example/jobs/7",
  );

  await row.click();
  const edit = page.getByRole("dialog", { name: "Edit Perception Intern" });
  await edit.getByRole("textbox", { name: "Location (optional)" }).fill("Orlando, FL");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();

  await row.click();
  await edit.getByRole("button", { name: "Delete this application" }).click();
  await edit.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByRole("button", { name: /^Juniper Robotics/ })).toHaveCount(0);
});

test("a person's page lists their applications and adds one with them filled in", async ({ page }) => {
  await freshDemo(page, "/people");
  await page.getByRole("link", { name: /^Riya Patel/ }).click();
  const card = page.getByRole("region", { name: "Applications" });
  await expect(card.getByRole("button", { name: /^Kestrel Systems/ })).toBeVisible();
  await card.getByRole("button", { name: "Add application" }).click();
  const add = page.getByRole("dialog", { name: "Add an application" });
  await expect(add.getByRole("combobox", { name: "Person (optional)" })).toHaveValue(/[0-9a-f-]{36}/);
  await add.getByRole("textbox", { name: "Company" }).fill("Kestrel Systems");
  await add.getByRole("textbox", { name: "Role" }).fill("Test Engineering Intern");
  await add.getByRole("button", { name: "Add application" }).click();
  await expect(card.getByRole("button", { name: /Test Engineering Intern/ })).toBeVisible();
});

test("import: preview, duplicates held back, all-or-nothing, and a repeat imports nothing twice", async ({ page }) => {
  await freshDemo(page, "/applications");
  const { today } = localToday();
  const kestrelDay = addDays(today, -20); // the seeded Kestrel application's date
  const sheet = [
    "Company Name\tPosition Title\tDate Applied\tStatus\tJob Link",
    `Kestrel Systems\tFirmware Engineering Intern\t${kestrelDay}\tInterview\t`,
    `Juniper Robotics\tPerception Intern\t${addDays(today, -3)}\tOA\twww.juniper.example/jobs/7`,
    `Aster Labs\tSoftware Intern\t${addDays(today, -2)}\tNo response yet\t`,
    "Bad Row\t\t\tApplied\t",
  ].join("\n");

  await page.getByRole("button", { name: "Import" }).click();
  const sheetDialog = page.getByRole("dialog", { name: "Import applications" });
  await sheetDialog.getByRole("textbox", { name: "Paste rows from a spreadsheet or a CSV file" }).fill(sheet);
  await expect(sheetDialog.getByRole("status")).toHaveText("2 to import · 1 already in your list · 1 with a problem");
  await expect(sheetDialog.getByText("No role.")).toBeVisible();
  await expect(sheetDialog.getByRole("combobox", { name: /Company Name/ })).toHaveValue("company");
  await sheetDialog.getByRole("button", { name: "Import 2 applications" }).click();
  await expect(sheetDialog).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Imported 2 applications." })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Juniper Robotics/ })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Status of Perception Intern at Juniper Robotics" })).toHaveValue("online_assessment");

  // The same paste again: everything is already there.
  await page.getByRole("button", { name: "Import" }).click();
  await sheetDialog.getByRole("textbox", { name: "Paste rows from a spreadsheet or a CSV file" }).fill(sheet);
  await expect(sheetDialog.getByRole("status")).toHaveText("0 to import · 3 already in your list · 1 with a problem");
  await expect(sheetDialog.getByRole("button", { name: "Import", exact: true })).toHaveAttribute("aria-disabled", "true");
});
