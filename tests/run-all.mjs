// Runs every test in tests/ (against the TEST database and Blob store — see tests/env.ts), a few
// at a time, and says which failed. A test passes when it exits 0. `npm test`, or
// `npm test -- visitor sounds` for only the files whose name contains one of those words.
import { spawn } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

const only = process.argv.slice(2);
const files = readdirSync("tests")
  .filter((f) => /\.(test|integration)\.ts$/.test(f))
  .filter((f) => !only.length || only.some((w) => f.includes(w)))
  .map((f) => `tests/${f}`);
const AT_ONCE = 6;

// The tests share one database and clean up by their tag («[xtest]»): two with the same tag
// would remove each other's rows mid-run.
const tags = new Map();
for (const f of readdirSync("tests").filter((f) => f.endsWith(".ts"))) {
  const tag = /^const TAG = "([^"]+)"/m.exec(readFileSync(`tests/${f}`, "utf8"))?.[1];
  if (!tag) continue;
  const clash = [...tags].find(([t]) => t.startsWith(tag.slice(0, -1)) || tag.startsWith(t.slice(0, -1)));
  if (clash) {
    console.error(`tests/${f} and tests/${clash[1]} share the tag ${tag}: give one its own.`);
    process.exit(1);
  }
  tags.set(tag, f);
}

const run = (file) =>
  new Promise((done) => {
    const started = Date.now();
    let out = "";
    const child = spawn("npx", ["tsx", file], { shell: true, env: { ...process.env, NODE_NO_WARNINGS: "1" } });
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => done({ file, code, out, seconds: (Date.now() - started) / 1000 }));
  });

const results = [];
const queue = [...files];
await Promise.all(
  Array.from({ length: AT_ONCE }, async () => {
    while (queue.length) {
      const r = await run(queue.shift());
      results.push(r);
      const passes = (r.out.match(/^(PASS |✔ )/gm) ?? []).length;
      console.log(`${r.code === 0 ? "ok  " : "FAIL"} ${r.file} (${passes} checks, ${r.seconds.toFixed(0)} s)`);
    }
  }),
);
const failed = results.filter((r) => r.code !== 0);
for (const r of failed) console.log(`\n── ${r.file}\n${r.out.split("\n").filter((l) => !/DEP0|trace-deprecation|sslmode|libpq|SSL|verify-full|prepare for|If you want|See https|next major/.test(l)).slice(-40).join("\n")}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
