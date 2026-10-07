// The core flow on a phone, as a new person does it: start as a guest → start a moment → add a
// photo → «نشر» → it shows on the moment → delete the moment. Against the TEST database and Blob
// store only (e2e/guard.ts); the moment is «أصحابي» (never public), and deleted at the end.
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { E2E_NAME } from "./names";

// A real photo-sized JPEG: a soft gradient with a few shapes, made on the spot.
async function photo() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6a35c"/><stop offset="1" stop-color="#5b7bd5"/></linearGradient></defs>
    <rect width="1080" height="1440" fill="url(#g)"/><circle cx="540" cy="620" r="180" fill="#ffd27a"/>
    <rect y="1100" width="1080" height="340" fill="#2f4a3a"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
}

test("guest → moment → photo → publish → shows → delete", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // What went wrong inside the page, shown when a step fails.
  page.on("console", (m) => m.type() === "error" && console.log("[browser]", m.text()));
  const title = `${E2E_NAME} غروب ${Date.now().toString(36)}`;

  // 1. Start as a guest: just a name.
  await page.goto("/");
  await page.locator("#displayName").first().fill(`${E2E_NAME} سلمى`);
  await page.getByRole("button", { name: "ابدأ" }).first().click();
  // Signed in once the session cookie is there.
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === "mova_session"), { timeout: 30_000 }).toBe(true);

  // 2. Start a moment («أصحابي», the default for a guest).
  await page.goto("/new");
  await page.locator('input[name="title"]').fill(title);
  await expect(page.locator('input[name="visibility"][value="FRIENDS"]')).toBeChecked();
  await expect(page.locator('input[name="visibility"][value="PUBLIC"]')).toHaveCount(0);
  await page.getByRole("button", { name: "ابدأ اللحظة" }).click();
  await page.waitForURL(/\/m\/[A-Z0-9]{6}/);
  const code = /\/m\/([A-Z0-9]{6})/.exec(page.url())![1];
  await expect(page.getByRole("heading", { name: title })).toBeVisible();

  // 3. Add a photo; it uploads, is checked, and waits for «نشر».
  await page.locator('input[type="file"]').first().setInputFiles({ name: "sunset.jpg", mimeType: "image/jpeg", buffer: await photo() });
  // The sounds open by themselves after the first shot (like TikTok): close them.
  const noSound = page.getByRole("button", { name: /بدون صوت/ });
  await noSound.or(page.getByText("جاهزة، اضغط «نشر»")).first().waitFor({ timeout: 90_000 });
  if (await noSound.isVisible()) {
    await noSound.click();
    await page.getByRole("button", { name: "اعتمد الصوت" }).click();
  }
  await expect(page.getByText("جاهزة، اضغط «نشر»")).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: /^🚀 نشر/ }).click();
  await expect(page.getByText("انتشرت ✓")).toBeVisible();

  // 4. It shows on the moment.
  await page.goto(`/m/${code}`);
  await expect(page.locator(`[id^="angle-"]`).first()).toBeVisible();
  expect(await page.locator(`[id^="angle-"]`).count()).toBe(1);

  // 5. The creator deletes the whole moment; the page is gone.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: /احذف اللحظة كاملة/ }).click();
  await page.waitForURL((url) => !url.pathname.startsWith(`/m/${code}`));
  expect((await page.request.get(`/m/${code}`)).status()).toBe(404);

  expect(errors, "no browser errors").toEqual([]);
});
