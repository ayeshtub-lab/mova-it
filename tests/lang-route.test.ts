// The language button's link (src/app/api/lang/route.ts): the choice remembered, the same page in the
// other language, only addresses on this site. Run: npx tsx tests/lang-route.test.ts
import assert from "node:assert/strict";
import { GET } from "../src/app/api/lang/route";

const go = (q: string) => GET(new Request(`https://zawmo.com/api/lang?${q}`));
const where = (r: Response) => new URL(r.headers.get("location")!).pathname + new URL(r.headers.get("location")!).search;

let r = go("to=ar&next=%2Fen%2Fm%2F59T4CU");
assert.equal(r.status, 303);
assert.equal(where(r), "/m/59T4CU");
assert.match(r.headers.get("set-cookie") ?? "", /lang=ar/);
r = go("to=en&next=%2Fm%2F59T4CU%3Fsrc%3Dx");
assert.equal(where(r), "/en/m/59T4CU?src=x");
assert.match(r.headers.get("set-cookie") ?? "", /lang=en/);
assert.equal(where(go("to=ar&next=%2Fen")), "/");
assert.equal(where(go("to=ar&next=%2Fen%3Fa%3D1")), "/?a=1");
assert.equal(where(go("to=ar&next=%2F%2Fevil.com")), "/", "never another site");
assert.equal(new URL(go("to=ar&next=https%3A%2F%2Fevil.com").headers.get("location")!).host, "zawmo.com");
assert.equal(where(go("to=xx&next=%2Fm%2F59T4CU")), "/");
console.log("language link ✓ (8 checks)");
