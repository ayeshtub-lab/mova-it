// Is the visitor inside an app's own browser (where Google sign-in is refused)?
// Run: npx tsx --test tests/inapp.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { isInAppBrowser } from "../src/lib/inapp";

test("app browsers: TikTok, Instagram, Facebook, Android webviews", () => {
  for (const ua of [
    "Mozilla/5.0 (Linux; Android 13; SM-A536B Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 trill_330004 BytedanceWebview/d8a21c6",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_33.8.0 JsSdk/2.0 NetType/WIFI Channel/App Store",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0.0",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0]",
  ])
    assert.ok(isInAppBrowser(ua), ua);
});

test("real browsers are not", () => {
  for (const ua of [
    "Mozilla/5.0 (Linux; Android 13; SM-A536B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  ])
    assert.ok(!isInAppBrowser(ua), ua);
  assert.equal(isInAppBrowser(null), false);
});
