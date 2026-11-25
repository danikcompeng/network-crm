// Signs into the demo ONCE per test run and saves the session, so the
// signed-in tests reuse it instead of signing in before every test.
// Supabase rate-limits sign-ins and other auth calls per address, and the
// demo account shares that limit with Hold and Bitewise.
import { test as setup } from "@playwright/test";
import { signInDemo } from "./helpers/app";

export const DEMO_SESSION = "e2e/.auth/demo.json";

setup("sign in to the demo", async ({ page }) => {
  await signInDemo(page);
  await page.context().storageState({ path: DEMO_SESSION });
});
