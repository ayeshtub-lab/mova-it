// The live site's vital signs, checked from the outside the way people and crawlers see it:
// pages open, a shared link shows its card, pictures load, hearts answer, crons stay locked.
// Read-only (GET requests, nothing is changed). Used after every deploy (tests/deploy.mjs,
// which switches back to the previous version when one fails) and every 15 minutes by
// /api/cron/health (which tells the admins). Plain fetch only: runs anywhere.

export type Check = { name: string; ok: boolean; detail: string; ms: number };

const WHATSAPP = "WhatsApp/2.24.1.0 A";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

async function get(url: string, ua = GOOGLEBOT, timeoutMs = 20_000) {
  const t0 = Date.now();
  const res = await fetch(url, { headers: { "user-agent": ua }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  return { res, ms: Date.now() - t0 };
}

export async function smokeChecks(base = "https://zawmo.com", expectBuild?: string): Promise<Check[]> {
  const checks: Check[] = [];
  const run = async (name: string, fn: () => Promise<string>) => {
    const t0 = Date.now();
    try {
      checks.push({ name, ok: true, detail: await fn(), ms: Date.now() - t0 });
    } catch (error) {
      checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error), ms: Date.now() - t0 });
    }
  };
  const must = (cond: unknown, why: string) => {
    if (!cond) throw new Error(why);
  };

  await run("home", async () => {
    const { res, ms } = await get(`${base}/`);
    must(res.status === 200, `status ${res.status}`);
    must((await res.text()).includes("<title>"), "no title");
    return `200 in ${ms} ms`;
  });

  await run("version", async () => {
    const { res } = await get(`${base}/api/version`);
    must(res.status === 200, `status ${res.status}`);
    const { build } = (await res.json()) as { build?: string };
    if (expectBuild) must(build?.startsWith(expectBuild), `build ${build?.slice(0, 7)} ≠ ${expectBuild.slice(0, 7)}`);
    return build?.slice(0, 7) ?? "?";
  });

  // The sitemap names a public moment, a place and (from the moment) a shot to look at.
  let sitemap = "";
  await run("sitemap", async () => {
    const { res } = await get(`${base}/sitemap.xml`);
    must(res.status === 200, `status ${res.status}`);
    sitemap = await res.text();
    const n = (sitemap.match(/<loc>/g) ?? []).length;
    must(n > 20, `only ${n} links`);
    return `${n} links`;
  });
  const moment = /<loc>(https?:\/\/[^<]+\/m\/[A-Z0-9]{6})<\/loc>/.exec(sitemap)?.[1]?.replace(/^https?:\/\/[^/]+/, base);
  const place = /<loc>(https?:\/\/[^<]+\/p\/[^<]+)<\/loc>/.exec(sitemap)?.[1]?.replace(/^https?:\/\/[^/]+/, base);

  let shotId: string | null = null;
  let ogImage: string | null = null;
  await run("moment page", async () => {
    must(moment, "no public moment in the sitemap");
    const { res, ms } = await get(moment!, WHATSAPP);
    must(res.status === 200, `status ${res.status}`);
    const html = await res.text();
    const head = html.split("</head>")[0];
    ogImage = /<meta property="og:image" content="([^"]+)"/.exec(head)?.[1]?.replace(/&amp;/g, "&") ?? null;
    must(ogImage, "og:image not in <head>");
    must(head.includes('rel="canonical"'), "canonical not in <head>");
    shotId = /\/i\/([a-z0-9]{20,40})(?:-small)?\.jpg/.exec(html)?.[1] ?? null;
    return `200 in ${ms} ms`;
  });

  await run("share card", async () => {
    must(ogImage, "no card address");
    const { res, ms } = await get(ogImage!.replace(/^https?:\/\/[^/]+/, base), WHATSAPP, 30_000);
    must(res.status === 200, `status ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    must(type.startsWith("image/"), `type ${type}`);
    const size = (await res.arrayBuffer()).byteLength;
    must(size < 600_000, `${Math.round(size / 1024)} KB — too heavy for WhatsApp`);
    return `${type} ${Math.round(size / 1024)} KB in ${ms} ms`;
  });

  await run("picture", async () => {
    must(shotId, "no /i/ picture on the moment page");
    const { res } = await get(`${base}/i/${shotId}-small.jpg`);
    must(res.status === 200, `status ${res.status}`);
    must((res.headers.get("content-type") ?? "").startsWith("image/"), "not an image");
    return "200";
  });

  await run("hearts", async () => {
    must(shotId, "no shot to ask about");
    const { res } = await get(`${base}/api/likes?ids=${shotId}`);
    must(res.status === 200, `status ${res.status}`);
    const body = (await res.json()) as Record<string, { count: number }>;
    must(typeof body[shotId!]?.count === "number", "no count");
    return `${body[shotId!].count} ❤`;
  });

  await run("place page", async () => {
    must(place, "no place in the sitemap");
    const { res } = await get(place!);
    must(res.status === 200, `status ${res.status}`);
    return "200";
  });

  await run("discover", async () => {
    const { res } = await get(`${base}/discover`);
    must(res.status === 200, `status ${res.status}`);
    return "200";
  });

  await run("robots", async () => {
    const { res } = await get(`${base}/robots.txt`);
    must(res.status === 200 && (await res.text()).includes("Sitemap:"), `status ${res.status}`);
    return "200";
  });

  // A cron without its secret must be refused (they can render videos and send pushes).
  await run("crons locked", async () => {
    const { res } = await get(`${base}/api/cron/branded`);
    must(res.status === 401, `status ${res.status} — open to anyone!`);
    return "401";
  });

  return checks;
}
