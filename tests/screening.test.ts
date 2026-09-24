// Unit test for how Gemini's answers become a verdict (src/server/screening.ts).
// Run: npx tsx tests/screening.test.ts — no network, no database: fetch is simulated.
import assert from "node:assert/strict";
import { askGemini } from "../src/server/screening";

process.env.GEMINI_API_KEY = "test-key";
const out: string[] = [];
const check = async (name: string, fn: () => Promise<void>) => {
  await fn();
  out.push("PASS " + name);
};

let lastRequest: { url: string; body: { contents: { parts: object[] }[] }; headers: Record<string, string> } | null = null;
function reply(status: number, body: unknown) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    lastRequest = { url, body: JSON.parse(String(init.body)), headers: init.headers as Record<string, string> };
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}
const answer = (text: string, finishReason = "STOP") => ({ candidates: [{ finishReason, content: { parts: [{ text }] } }] });

async function main() {
  await check("allow", async () => {
    reply(200, answer('{"verdict":"allow","category":"none","reason":"family dinner"}'));
    assert.deepEqual(await askGemini(["aGk="]), { result: "allowed" });
    assert.equal(lastRequest?.headers["x-goog-api-key"], "test-key");
    assert.equal(lastRequest?.body.contents[0].parts.length, 2, "prompt + one image");
  });

  await check("block with category and reason", async () => {
    reply(200, answer('{"verdict":"block","category":"violence","reason":"graphic injury"}'));
    assert.deepEqual(await askGemini(["a", "b", "c"]), { result: "blocked", category: "violence", reason: "graphic injury" });
    assert.equal(lastRequest?.body.contents[0].parts.length, 4);
  });

  await check("Gemini refusing the input counts as blocked", async () => {
    reply(200, { promptFeedback: { blockReason: "PROHIBITED_CONTENT" } });
    assert.equal((await askGemini(["a"])).result, "blocked");
    reply(200, answer("", "SAFETY"));
    assert.equal((await askGemini(["a"])).result, "blocked");
  });

  await check("errors never block: bad key, unreadable answer", async () => {
    reply(403, { error: { message: "API key not valid" } });
    const v = await askGemini(["a"]);
    assert.equal(v.result, "error");
    assert.match(v.result === "error" ? v.reason : "", /403/);
    reply(200, answer("I think it's fine"));
    assert.equal((await askGemini(["a"])).result, "error");
  });
}

main()
  .then(() => console.log(out.join("\n")))
  .catch((error) => {
    console.log(out.join("\n"));
    console.log("FAIL", error);
    process.exit(1);
  });
