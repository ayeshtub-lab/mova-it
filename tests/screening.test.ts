// Unit test for how Gemini's answers become a verdict (src/server/screening.ts).
// Run: npx tsx tests/screening.test.ts — no network, no database: fetch is simulated.
import assert from "node:assert/strict";
import { aiTextOf, askGemini, captionIdeasOf, likeness, RETRY_DELAYS_MS } from "../src/server/screening";

process.env.GEMINI_API_KEY = "test-key";
// No real waiting between retries here.
RETRY_DELAYS_MS.fill(0);
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

  await check("the lens names the moment: plain words, no quotes or hashtags", async () => {
    reply(200, answer('{"verdict":"allow","category":"none","reason":"grapes","scene":"nature","text":"","landmark":"","title":"«#عنب   الدالية»"}'));
    assert.deepEqual(await askGemini(["a"]), { result: "allowed", scene: "nature", title: "عنب الدالية" });
    reply(200, answer('{"verdict":"allow","category":"none","reason":"x","title":"  "}'));
    assert.deepEqual(await askGemini(["a"]), { result: "allowed" }, "an empty name is left out");
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

  await check("the lens compares pictures in three levels (same / similar / no); anything odd = no", async () => {
    reply(200, answer('{"likeness":{"2":"same","3":"similar","4":"no"}}'));
    assert.deepEqual(await likeness("mine", ["a", "b", "c"]), ["same", "similar", "no"]);
    assert.match(JSON.stringify(lastRequest?.body), /Image 4:/, "every picture is labelled with its number");
    reply(200, answer('{"likeness":{"2":"same","4":"similar"}}'));
    assert.deepEqual(await likeness("mine", ["a", "b", "c"]), ["same", "no", "similar"], "a missing number counts as no, the others still count");
    reply(200, answer('{"likeness":["same","similar","no"]}'));
    assert.deepEqual(await likeness("mine", ["a", "b", "c"]), ["same", "similar", "no"], "a complete plain list still works");
    assert.equal(lastRequest?.body.contents[0].parts.length, 9, "prompt + 4 labelled pictures in one call");
    assert.match(JSON.stringify(lastRequest?.body), /two different flowers/, "the prompt explains «similar»");
    reply(200, answer('{"likeness":["same","maybe"]}'));
    assert.deepEqual(await likeness("mine", ["a", "b"]), ["same", "no"], "unknown words = no");
    reply(200, answer('{"likeness":["same"]}'));
    assert.deepEqual(await likeness("mine", ["a", "b"]), ["no", "no"], "wrong length");
    reply(500, { error: { message: "down" } });
    assert.deepEqual(await likeness("mine", ["a"]), ["no"]);
  });

  await check("the same call names the scene (for «صوّر معك»); unknown scenes are dropped", async () => {
    reply(200, answer('{"verdict":"allow","category":"none","reason":"a sunset","scene":"sunset"}'));
    assert.deepEqual(await askGemini(["a"]), { result: "allowed", scene: "sunset" });
    reply(200, answer('{"verdict":"allow","category":"none","reason":"x","scene":"volcano"}'));
    assert.deepEqual(await askGemini(["a"]), { result: "allowed" });
    assert.match(JSON.stringify(lastRequest?.body), /sunset, sunrise/, "the prompt lists the scenes");
  });

  // A busy Gemini (503) once hid a real public shot: passing errors are tried again.
  const sequence = (replies: [number, unknown][]) => {
    let calls = 0;
    globalThis.fetch = (async () => {
      const [status, body] = replies[Math.min(calls++, replies.length - 1)];
      return new Response(JSON.stringify(body), { status });
    }) as unknown as typeof fetch;
    return () => calls;
  };
  await check("a busy Gemini (503) is tried again, and the answer counts", async () => {
    const calls = sequence([[503, { error: { message: "The service is currently unavailable." } }], [200, answer('{"verdict":"allow","category":"none","reason":"farm"}')]]);
    assert.deepEqual(await askGemini(["a"]), { result: "allowed" });
    assert.equal(calls(), 2);
  });
  await check("a picture gets a warm line with its #hashtags (tidied, ≤150)", async () => {
    sequence([[200, answer(JSON.stringify({ verdict: "allow", category: "none", reason: "ok", description: " غروب  ذهبي فوق البحر \"الهادئ\" ", hashtags: ["#غروب", "بحر هادئ", "غروب", "!!"] }))]]);
    assert.deepEqual(await askGemini(["a"]), { result: "allowed", text: "غروب ذهبي فوق البحر الهادئ #غروب #بحر_هادئ" });
    assert.equal(aiTextOf("", ["x"]), "", "no sentence, no line");
    assert.ok(aiTextOf("ك".repeat(200), ["وسم".repeat(9), "ثاني"]).length <= 150);
  });
  await check("lines to write on the shot come tidied, 2–40 characters, three at most", async () => {
    sequence([[200, answer(JSON.stringify({ verdict: "allow", category: "none", reason: "ok", captions: [" «أحلى  صبحية» ☕ ", "#ريحة_البلاد", "ك", "ك".repeat(41), "أحلى صبحية ☕", "لمّة ❤️", "رابع"] }))]]);
    assert.deepEqual(await askGemini(["a"]), { result: "allowed", captions: ["أحلى صبحية ☕", "ريحة_البلاد", "لمّة ❤️"] });
    assert.deepEqual(captionIdeasOf("not a list"), []);
  });
  await check("still busy after three tries: an error, not a verdict", async () => {
    const calls = sequence([[503, { error: { message: "busy" } }]]);
    assert.equal((await askGemini(["a"])).result, "error");
    assert.equal(calls(), 3);
  });
  await check("a real refusal (403) is not tried again", async () => {
    const calls = sequence([[403, { error: { message: "API key not valid" } }]]);
    assert.equal((await askGemini(["a"])).result, "error");
    assert.equal(calls(), 1);
  });
}

main()
  .then(() => console.log(out.join("\n")))
  .catch((error) => {
    console.log(out.join("\n"));
    console.log("FAIL", error);
    process.exit(1);
  });
