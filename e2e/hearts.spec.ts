// A heart stays: like a shot, go elsewhere, come back with the phone's back button — the heart
// is still red (the page must not show an old copy from before the like).
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { E2E_NAME } from "./names";

test("a heart survives leaving the page and coming back", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  await page.locator("#displayName").first().fill(`${E2E_NAME} قلب`);
  await page.getByRole("button", { name: "ابدأ" }).first().click();
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === "mova_session"), { timeout: 30_000 }).toBe(true);

  await page.goto("/new");
  await page.locator('input[name="title"]').fill(`${E2E_NAME} قلوب ${Date.now().toString(36)}`);
  await page.getByRole("button", { name: "ابدأ اللحظة" }).click();
  await page.waitForURL(/\/m\/[A-Z0-9]{6}/);
  const code = /\/m\/([A-Z0-9]{6})/.exec(page.url())![1];
  const jpeg = await sharp({ create: { width: 900, height: 1200, channels: 3, background: "#d77a4a" } }).jpeg().toBuffer();
  await page.locator('input[type="file"]').first().setInputFiles({ name: "h.jpg", mimeType: "image/jpeg", buffer: jpeg });
  const noSound = page.getByRole("button", { name: /بدون صوت/ });
  await noSound.or(page.getByText("✓ جاهزة")).first().waitFor({ timeout: 90_000 });
  if (await noSound.isVisible()) {
    await noSound.click();
    await page.getByRole("button", { name: "اعتمد الصوت" }).click();
  }
  await page.getByRole("button", { name: /^🚀 نشر/ }).click();
  await expect(page.getByText("✅ انضافت زاويتك للحظة")).toBeVisible();
  await page.goto(`/m/${code}`);

  // Like it in the viewer.
  await page.locator(`[id^="angle-"] button`).first().click();
  const saved = page.waitForResponse((r) => r.url().includes("/reaction") && r.request().method() === "POST");
  await page.getByRole("button", { name: "إعجاب", exact: true }).first().click();
  expect((await saved).status()).toBe(200);
  await expect(page.getByRole("button", { name: "إلغاء الإعجاب", exact: true }).first()).toBeVisible();

  // Away (a link, like a person would), then back.
  await page.keyboard.press("Escape");
  await page.goto("/discover");
  await page.goBack();
  await page.waitForURL(new RegExp(`/m/${code}`));
  await page.locator(`[id^="angle-"] button`).first().click();
  await expect(page.getByRole("button", { name: "إلغاء الإعجاب", exact: true }).first()).toBeVisible();

  // Clean up: the moment goes.
  await page.keyboard.press("Escape");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /احذف اللحظة كاملة/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith(`/m/${code}`));
});
