// Safe deploy: `npm run deploy` (after the build and tests pass).
// 1. remembers which version is live now;
// 2. pushes v2 (and v2 → main, which Vercel deploys to zawmo.com), retrying GitHub hiccups;
// 3. waits until zawmo.com runs this commit (promoting it itself if Vercel built it but didn't
//    put it live — e.g. after a rollback, which turns automatic promotion off);
// 4. checks the live site's vital signs (tests/smoke.ts) — twice, a cold start can fail once;
// 5. if they fail: puts the previous version back live at once (`vercel promote`) and stops
//    with what failed. People get a broken version for a minute at most.
import { execSync } from "node:child_process";

const sh = (cmd, opts = {}) => execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
const say = (s) => console.log(`\n▶ ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vercelJson = (args) => JSON.parse(sh(`npx vercel ${args} --format json`, { timeout: 180_000 }).replace(/^[^{]*/, ""));

const branch = sh("git rev-parse --abbrev-ref HEAD").trim();
if (branch !== "v2") throw new Error(`on ${branch}, deploys go from v2`);
if (sh("git status --porcelain --untracked-files=no").trim()) throw new Error("uncommitted changes: commit first");
const head = sh("git rev-parse HEAD").trim();

say("the version live now");
const before = vercelJson("inspect zawmo.com");
console.log(`  ${before.url} (${before.id})`);

say("push");
for (let i = 1; ; i++) {
  try {
    sh("git push -q origin v2");
    sh("git push -q origin v2:main");
    break;
  } catch (error) {
    if (i === 4) throw error;
    console.log(`  GitHub refused (try ${i}), again in 30 s — https://www.githubstatus.com`);
    await sleep(30_000);
  }
}

say(`waiting for ${head.slice(0, 7)} on zawmo.com`);
const live = async () => ((await (await fetch("https://zawmo.com/api/version", { cache: "no-store" }).catch(() => null))?.json().catch(() => null))?.build ?? "") === head;
const started = Date.now();
let promoted = false;
while (!(await live())) {
  if (Date.now() - started > 20 * 60_000) throw new Error("not live after 20 minutes — check Vercel");
  // Built but not put live (automatic promotion off after a rollback)? Promote it.
  if (!promoted && Date.now() - started > 6 * 60_000) {
    const mine = vercelJson("ls mova-it --prod").deployments.find((d) => d.meta?.githubCommitSha === head && d.state === "READY");
    if (mine) {
      console.log(`  built but not live: promoting ${mine.url}`);
      sh(`npx vercel promote ${mine.url} --yes`, { timeout: 300_000 });
      promoted = true;
    }
  }
  await sleep(20_000);
}
console.log("  live ✓");

say("vital signs");
let ok = false;
for (let i = 1; i <= 2 && !ok; i++) {
  try {
    console.log(sh(`npx tsx tests/smoke.ts https://zawmo.com ${head}`, { timeout: 240_000 }));
    ok = true;
  } catch (error) {
    console.log(error.stdout ?? error.message);
    if (i === 1) {
      console.log("  once more in 30 s (a cold start can fail once)");
      await sleep(30_000);
    }
  }
}
if (ok) {
  console.log("✅ deployed and healthy");
  process.exit(0);
}

say(`ROLLING BACK to ${before.url}`);
sh(`npx vercel promote ${before.url} --yes`, { timeout: 300_000 });
console.log("❌ the new version failed its checks — the previous one is live again. Fix, then `npm run deploy` again.");
process.exit(1);
