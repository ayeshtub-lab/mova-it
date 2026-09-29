// The first name shown on the visitor home's wheel. Run: npx tsx --test tests/names.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { firstName } from "../src/lib/names";

test("the first word of a name", () => {
  assert.equal(firstName("سلمى أحمد"), "سلمى");
  assert.equal(firstName("  Moutaz  Ali "), "Moutaz");
  assert.equal(firstName("Zawmo"), "Zawmo");
});

test("compound first names stay whole", () => {
  assert.equal(firstName("عبد الله محمود"), "عبد الله");
  assert.equal(firstName("أبو أحمد"), "أبو أحمد");
  assert.equal(firstName("Abu Omar Saleh"), "Abu Omar");
  assert.equal(firstName("عبد"), "عبد");
});
