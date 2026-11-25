// A short check of a deployed copy, after each deploy:
//   BASE_URL=https://orbit-dk.vercel.app npx playwright test
// With a non-local BASE_URL, playwright.config.ts runs ONLY this file and
// install.e2e.ts (and local runs leave this file out). The demo account is
// shared (with Hold and Bitewise) and live visitors use it, so this signs
// in once, like a visitor (which reseeds a stale or changed demo, as any
// visitor's sign-in does), takes back the one thing it saves, and presses
// Reset demo only if taking it back didn't work.

import { expect, test, type Page } from "@playwright/test";
import { APP_NAME } from "../lib/app-identity";
import { AUTH_COOKIE_NAME } from "../lib/supabase/cookie";
import { signInDemo } from "./helpers/app";

/** Waits for the server action (a POST with a Next-Action header) to answer. */
function actionResponse(page: Page) {
  return page.waitForResponse((r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]));
}

test("the login link's landing address exists and never leaves the site", async ({ request, baseURL }) => {
  const response = await request.get("/auth/confirm", { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe(new URL("/login?error=link", baseURL).href);
});

test("logged out goes to login; the demo opens Today; every tab loads; a log is SAVED and Undo takes it back", async ({ page }) => {
  // A cold start can take a while; leave room for the cleanup too.
  test.setTimeout(120_000);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page).toHaveTitle(`Log in · ${APP_NAME}`);

  await signInDemo(page);
  await expect(page.getByRole("heading", { level: 1, name: "Today" })).toBeVisible();

  // The login cookie: only the server can read it, and (deployed) only over HTTPS.
  const auth = (await page.context().cookies()).filter((c) => c.name.startsWith(AUTH_COOKIE_NAME));
  expect(auth.length).toBeGreaterThan(0);
  const https = page.url().startsWith("https:");
  for (const cookie of auth) expect(cookie, cookie.name).toMatchObject({ httpOnly: true, secure: https });

  for (const [tab, heading] of [
    ["People", "People"],
    ["Applications", "Applications"],
    ["Map", "Your network"],
    ["Today", "Today"],
  ]) {
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: tab }).click();
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    // The map itself draws (d3-force runs in the browser).
    if (tab === "Map") await expect(page.getByRole("img", { name: /^Network map\./ })).toBeVisible();
  }

  // Log a message with whoever is first in Follow up, by position. Sign-in
  // reseeds a changed demo, so nobody due means the seed itself is wrong:
  // fail loudly rather than skip, so a broken save can't hide.
  const due = page.getByRole("region", { name: "Follow up" }).getByRole("button", { name: /^Log contact with / });
  expect(await due.count(), "nobody is due in the demo; sign in again later (it reseeds) and rerun").toBeGreaterThan(0);
  const name = (await due.first().textContent())!.replace(/^Log contact with /, "").trim();
  await due.first().click();

  // The action answers 200 even when it fails ({ ok: false }); the status
  // line only appears on a real save, and the reload below is the proof.
  let clicked = false;
  let restored = false;
  try {
    const saved = actionResponse(page);
    await page.getByRole("dialog", { name: `Log contact with ${name}` }).getByRole("button", { name: "Message" }).click();
    clicked = true; // from here a log may exist
    expect((await saved).ok()).toBe(true);
    const logged = page.getByRole("dialog", { name });
    await expect(logged.getByRole("status")).toContainText(`Logged a message with ${name}.`);

    // Put the demo back as it was: the sheet closes only when Undo worked,
    // and after a reload they're due again.
    const undone = actionResponse(page);
    await logged.getByRole("button", { name: "Undo" }).click();
    expect((await undone).ok()).toBe(true);
    await expect(logged).toBeHidden();
    restored = true; // Undo worked; what follows only checks it
    await page.reload();
    await expect(page.getByRole("region", { name: "Follow up" }).getByRole("button", { name: `Log contact with ${name}` })).toBeVisible();
  } catch (error) {
    if (clicked && !restored) {
      // Don't leave a stray log on the live demo for its visitors. A failed
      // reset is reported, never in place of the real failure.
      try {
        await page.goto("/");
        await page.getByRole("button", { name: "Reset demo" }).click({ timeout: 10_000 });
        await expect(page.getByRole("status").filter({ hasText: "Demo reset" })).toBeVisible();
      } catch (resetError) {
        console.error("Couldn't reset the live demo: press Reset demo on Today by hand.", resetError);
      }
    }
    throw error;
  }
});
