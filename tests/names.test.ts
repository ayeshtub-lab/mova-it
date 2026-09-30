// The first name shown on the visitor home's wheel. Run: npx tsx --test tests/names.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { firstName, isReservedName } from "../src/lib/names";

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

test("«زاومو» and «Zawmo» are reserved, also dressed up", () => {
  for (const n of ["زاومو", "Zawmo", "ZAWMO official", "فريق زاومو", "ز ا و م و", "زاوْمو", "zawm0", "Zaw-mo", "z.a.w.m.o", "Ζawmo", "zaumo", "أنا زاومو 😎"]) assert.equal(isReservedName(n), true, n);
});

test("ordinary names are not", () => {
  for (const n of ["سلمى أحمد", "Moutaz", "زياد", "Zawi", "مو زاو", "Omar Mo", "ضيف 4217"]) assert.equal(isReservedName(n), false, n);
});
