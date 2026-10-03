// Unit test for where a visit came from (src/lib/source.ts): our ad links first, then UTM
// tags, then the referring site by name — never Zawmo itself, never a full link.
// Run: npx tsx tests/source.test.ts
import assert from "node:assert/strict";
import { sourceOf, tagged } from "../src/lib/source";

const u = (q: string) => new URL(`https://zawmo.com/start${q}`);
const out: string[] = [];
const check = (name: string, fn: () => void) => {
  fn();
  out.push("PASS " + name);
};

check("an ad link's src wins, cleaned", () => {
  assert.equal(sourceOf(u("?src=TikTok-Plant&utm_source=x"), "https://www.tiktok.com/", "zawmo.com"), "tiktok-plant");
  assert.equal(sourceOf(u("?src=%3Cscript%3E"), null, "zawmo.com"), "script");
  assert.equal(sourceOf(u(`?src=${"a".repeat(80)}`), null, "zawmo.com")!.length, 40);
});
check("UTM source, with the campaign when there is one", () => {
  assert.equal(sourceOf(u("?utm_source=facebook&utm_campaign=Stories 1"), null, "zawmo.com"), "facebook-stories-1");
  assert.equal(sourceOf(u("?utm_source=snap"), null, "zawmo.com"), "snap");
});
check("the referring site by name", () => {
  assert.equal(sourceOf(u(""), "https://l.facebook.com/l.php?u=x", "zawmo.com"), "facebook");
  assert.equal(sourceOf(u(""), "https://www.google.com/", "zawmo.com"), "google");
  assert.equal(sourceOf(u(""), "https://wa.me/", "zawmo.com"), "whatsapp");
  assert.equal(sourceOf(u(""), "https://t.co/abc", "zawmo.com"), "x");
  assert.equal(sourceOf(u(""), "https://blog.example.org/post?id=7", "zawmo.com"), "blog-example-org");
});
check("nothing for Zawmo itself, typed-in visits or junk", () => {
  assert.equal(sourceOf(u(""), "https://zawmo.com/discover", "zawmo.com"), null);
  assert.equal(sourceOf(u(""), "https://www.zawmo.com/", "zawmo.com"), null);
  assert.equal(sourceOf(u(""), "https://mova-it.vercel.app/", "zawmo.com"), null);
  assert.equal(sourceOf(u(""), null, "zawmo.com"), null);
  assert.equal(sourceOf(u(""), "not a url", "zawmo.com"), null);
});
check("links Zawmo hands out say which door they are (before the #, never twice)", () => {
  assert.equal(tagged("https://zawmo.com/m/K7M2Q4", "wa-moment"), "https://zawmo.com/m/K7M2Q4?src=wa-moment");
  assert.equal(tagged("https://zawmo.com/m/K7M2Q4#angle-x", "share-shot"), "https://zawmo.com/m/K7M2Q4?src=share-shot#angle-x");
  assert.equal(tagged("/m/K7M2Q4?a=1", "video-link"), "/m/K7M2Q4?a=1&src=video-link");
  assert.equal(tagged("/m/K7M2Q4?src=tiktok-house", "video-link"), "/m/K7M2Q4?src=tiktok-house");
});
console.log(out.join("\n"));
