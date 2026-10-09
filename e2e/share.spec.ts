// «شارك لزاومو» from the phone's gallery (the manifest's share_target): the service worker keeps
// the shared photo, the new-moment page says it is ready, and the moment started there adds it
// by itself. Against the TEST database and Blob store only (e2e/guard.ts); a «أصحابي» moment,
// removed by the e2e clean-up.
import { expect, test } from "@playwright/test";
import { E2E_NAME } from "./names";

test("a photo shared from the gallery lands in the new moment", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.locator("#displayName").first().fill(`${E2E_NAME} معرض`);
  await page.getByRole("button", { name: "ابدأ" }).first().click();
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === "mova_session"), { timeout: 30_000 }).toBe(true);

  // What Android sends when «زاومو» is picked in the share sheet: a form POST to /share.
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const landed = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1200;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#f6a35c";
    g.fillRect(0, 0, 900, 1200);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85));
    const form = new FormData();
    form.append("media", new File([blob], "from-gallery.jpg", { type: "image/jpeg" }));
    return (await fetch("/share", { method: "POST", body: form })).url;
  });
  expect(new URL(landed).pathname + new URL(landed).search).toBe("/new?shared=1");

  await page.goto("/new?shared=1");
  await expect(page.getByText(/من معرضك جاهزين/)).toBeVisible();
  await page.locator('input[name="title"]').fill(`${E2E_NAME} من المعرض`);
  await page.getByRole("button", { name: "ابدأ اللحظة" }).click();
  await page.waitForURL(/\/m\/[A-Z0-9]{6}/);
  // The uploader takes the shared photo by itself — the publish sheet opens with it, big — and
  // the kept copy is gone.
  const sheet = page.getByRole("dialog", { name: "زاويتك الجديدة" });
  await expect(sheet).toBeVisible({ timeout: 60_000 });
  await expect(sheet.locator("img").first()).toBeVisible();
  expect(await page.evaluate(async () => (await caches.keys()).includes("zawmo-share"))).toBe(false);

  expect(errors, "no browser errors").toEqual([]);
});
