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

// «📸 ضيفها كزاوية للحظة عندك»: the same share, into a moment you already have.
test("a photo shared from the gallery goes into one of your moments", async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.locator("#displayName").first().fill(`${E2E_NAME} معرض٢`);
  await page.getByRole("button", { name: "ابدأ" }).first().click();
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === "mova_session"), { timeout: 30_000 }).toBe(true);
  // A moment of theirs first.
  await page.goto("/new");
  await page.locator('input[name="title"]').fill(`${E2E_NAME} لحظة قديمة`);
  await page.getByRole("button", { name: "ابدأ اللحظة" }).click();
  await page.waitForURL(/\/m\/[A-Z0-9]{6}/);
  const code = new URL(page.url()).pathname.split("/")[2];

  await page.evaluate(() => navigator.serviceWorker.ready);
  const landed = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1200;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#5c9ef6";
    g.fillRect(0, 0, 900, 1200);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85));
    const form = new FormData();
    form.append("media", new File([blob], "from-gallery.jpg", { type: "image/jpeg" }));
    return (await fetch("/share", { method: "POST", body: form })).url;
  });
  expect(new URL(landed).pathname + new URL(landed).search).toBe("/new?shared=1");

  await page.goto("/new?shared=1");
  await page.locator(`a[href="/m/${code}#join"]`).click();
  await page.waitForURL(new RegExp(`/m/${code}`));
  const sheet = page.getByRole("dialog", { name: "زاويتك الجديدة" });
  await expect(sheet).toBeVisible({ timeout: 60_000 });
  await expect(sheet.locator("img").first()).toBeVisible();
  expect(errors, "no browser errors").toEqual([]);
});

// As on the phone: the share comes from OUTSIDE Zawmo (Android's share sheet) — a cross-site form
// POST, which carries no sign-in cookie. It must still end on /new signed in, not on the home
// page (2026-10-15: a video shared from the gallery on the Play app landed on the home page).
test("a share from outside Zawmo still lands signed in on /new", async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto("/");
  await page.locator("#displayName").first().fill(`${E2E_NAME} معرض٣`);
  await page.getByRole("button", { name: "ابدأ" }).first().click();
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === "mova_session"), { timeout: 30_000 }).toBe(true);
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const target = new URL("/share", page.url()).href;

  await page.goto("about:blank");
  await page.setContent(`<form method="post" enctype="multipart/form-data" action="${target}"><input type="file" name="media"><button>go</button></form>`);
  await page.locator('input[type="file"]').setInputFiles({ name: "clip.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(4096, 1) });
  await page.locator("button").click();
  await page.waitForURL(/\/new\?shared=1/, { timeout: 60_000 });
  await expect(page.getByText(/من معرضك جاهزين/)).toBeVisible();
});

// «📍 أرطاس؟»: a moment whose name says where offers that place on the publish sheet; one tap
// places the shot (src/server/place-guess.ts).
test("the place in the moment's name is offered, one tap places the shot", async ({ page }) => {
  test.setTimeout(480_000);
  await page.goto("/");
  await page.locator("#displayName").first().fill(`${E2E_NAME} مكان`);
  await page.getByRole("button", { name: "ابدأ" }).first().click();
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === "mova_session"), { timeout: 30_000 }).toBe(true);
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 1200;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#7bc96f";
    g.fillRect(0, 0, 900, 1200);
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.85));
    const form = new FormData();
    form.append("media", new File([blob], "artas.jpg", { type: "image/jpeg" }));
    await fetch("/share", { method: "POST", body: form });
  });
  await page.goto("/new?shared=1");
  await page.locator('input[name="title"]').fill(`${E2E_NAME} عرس في أرطاس`);
  await page.getByRole("button", { name: "ابدأ اللحظة" }).click();
  await page.waitForURL(/\/m\/[A-Z0-9]{6}/);
  const sheet = page.getByRole("dialog", { name: "زاويتك الجديدة" });
  await expect(sheet).toBeVisible({ timeout: 60_000 });
  await expect(sheet.getByText("📍 أرطاس؟")).toBeVisible({ timeout: 240_000 });
  await sheet.getByRole("button", { name: "أيوه، هون" }).click();
  await expect(sheet.getByText("📍 أرطاس ✓")).toBeVisible({ timeout: 120_000 });
});
