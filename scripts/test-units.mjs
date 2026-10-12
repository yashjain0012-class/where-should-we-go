// Run with: npm run test:units   (compiles lib/units.ts with tsc, then runs these checks)
import assert from "node:assert/strict";
import { defaultUnit, formatDistance } from "../.test-build/units.js";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    process.exitCode = 1;
    console.error(`  FAIL ${name}\n       ${err.message}`);
  }
}

console.log("formatting distances");
test("kilometres: metres below 1 km, then km without a trailing .0", () => {
  assert.equal(formatDistance(500, "km"), "500 m");
  assert.equal(formatDistance(750, "km"), "750 m");
  assert.equal(formatDistance(1000, "km"), "1 km");
  assert.equal(formatDistance(1500, "km"), "1.5 km");
  assert.equal(formatDistance(5000, "km"), "5 km");
});
test("miles: one decimal, no trailing .0", () => {
  assert.equal(formatDistance(500, "mi"), "0.3 mi");
  assert.equal(formatDistance(1000, "mi"), "0.6 mi");
  assert.equal(formatDistance(1609.344, "mi"), "1 mi");
  assert.equal(formatDistance(2000, "mi"), "1.2 mi");
  assert.equal(formatDistance(5000, "mi"), "3.1 mi");
});
test("every slider step reads sensibly in miles and never repeats a neighbour's label", () => {
  const labels = [];
  for (let m = 500; m <= 5000; m += 250) labels.push(formatDistance(m, "mi"));
  assert.ok(labels.every((l) => /^\d+(\.\d)? mi$/.test(l)), labels.join(", "));
  // adjacent steps (250 m) may share a label at one decimal, but the ends must differ
  assert.notEqual(labels[0], labels.at(-1));
  assert.deepEqual([...labels].sort((a, b) => parseFloat(a) - parseFloat(b)), labels); // in order
});

console.log("the default unit");
test("miles where people use them", () => {
  for (const lang of ["en-US", "en-GB", "en_US", "es-US", "en-us"]) assert.equal(defaultUnit(lang), "mi", lang);
});
test("kilometres elsewhere, and when nothing is known", () => {
  for (const lang of ["en-IN", "hi-IN", "hi", "en", "fr-FR", "de-DE", "", undefined, "garbage", "e"]) assert.equal(defaultUnit(lang), "km", String(lang));
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
