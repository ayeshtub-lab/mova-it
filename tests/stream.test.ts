// Unit test for Cloudflare Stream links (src/server/stream.ts): a video plays from Stream only
// once it's ready, through a signed, expiring link for that one video.
// Run: npx tsx tests/stream.test.ts — no network, no database (a throwaway signing key).
import "./env";
import assert from "node:assert/strict";
import { createVerify, generateKeyPairSync } from "node:crypto";

const out: string[] = [];
const check = (name: string, fn: () => void) => {
  fn();
  out.push("PASS " + name);
};

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.CLOUDFLARE_ACCOUNT_ID = "acct";
process.env.CLOUDFLARE_STREAM_TOKEN = "token";
process.env.CLOUDFLARE_STREAM_SUBDOMAIN = "customer-test.cloudflarestream.com";
process.env.STREAM_SIGNING_KEY_ID = "kid123";
process.env.STREAM_SIGNING_KEY_PEM = Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" }).toString()).toString("base64");

async function main() {
  const { hlsUrl } = await import("../src/server/stream");

  check("no Stream copy, or not encoded yet → null (the original file plays)", () => {
    assert.equal(hlsUrl({ streamUid: null, streamReady: false }), null);
    assert.equal(hlsUrl({ streamUid: "abc", streamReady: false }), null);
  });

  check("ready → a signed HLS link for that one video, expiring in about 2 hours", () => {
    const url = hlsUrl({ streamUid: "video-uid-1", streamReady: true })!;
    const m = /^https:\/\/customer-test\.cloudflarestream\.com\/([^/]+)\/manifest\/video\.m3u8$/.exec(url);
    assert.ok(m, url);
    const [head, claims, sig] = m[1].split(".");
    const verify = createVerify("RSA-SHA256");
    verify.update(`${head}.${claims}`);
    assert.ok(verify.verify(publicKey, Buffer.from(sig, "base64url")), "signed with our key");
    const h = JSON.parse(Buffer.from(head, "base64url").toString());
    const c = JSON.parse(Buffer.from(claims, "base64url").toString());
    assert.deepEqual([h.alg, h.kid, c.sub, c.kid], ["RS256", "kid123", "video-uid-1", "kid123"]);
    const left = c.exp - Date.now() / 1000;
    assert.ok(left > 110 * 60 && left <= 120 * 60, `expires in ${Math.round(left / 60)} min`);
  });

  console.log(out.join("\n"));
}
main();
