// A first-time visitor on a phone: the home page, «اكتشف» and the legal pages open without a
// single error in the browser, and nothing is wider than the screen.
import { expect, test, type Page } from "@playwright/test";

// Errors the page itself throws or logs (a missing file, a crash in a component).
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  return errors;
}

const fitsScreen = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

for (const [path, heading] of [
  ["/", null],
  ["/discover", "اكتشف"],
  ["/privacy", null],
  ["/terms", null],
  ["/start", null],
] as const) {
  test(`${path} opens cleanly`, async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto(path);
    expect(res?.status()).toBe(200);
    await expect(page.locator("main").first()).toBeVisible();
    if (heading) await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await fitsScreen(page), "nothing wider than the phone").toBe(true);
    expect(errors, "no browser errors").toEqual([]);
  });
}

test("a page that doesn't exist says so, with a way back", async ({ page }) => {
  const res = await page.goto("/m/NOPE00");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("link").first()).toBeVisible();
});
