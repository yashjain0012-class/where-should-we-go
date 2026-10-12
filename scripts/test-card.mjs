// Run with: npm run test:card   (compiles lib/resultCard.ts and lib/textWrap.ts with tsc, then runs these checks)
import assert from "node:assert/strict";
import { wrapLines } from "../.test-build/textWrap.js";
import { cardFileName } from "../.test-build/resultCard.js";

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
/** Every character is 10 units wide. */
const measure = (s) => s.length * 10;

console.log("wrapping text");
test("short text stays on one line", () => {
  assert.deepEqual(wrapLines("Hoxton Grill", 200, measure, 3), ["Hoxton Grill"]);
});
test("breaks at spaces, greedily", () => {
  assert.deepEqual(wrapLines("The Clove Club and Bar", 120, measure, 3), ["The Clove", "Club and Bar"]);
});
test("a line is never wider than the limit", () => {
  for (const text of ["A very long restaurant name that keeps going", "x".repeat(55), "a b c d e f g h i j k l m n o p"]) {
    for (const line of wrapLines(text, 100, measure, 20)) assert.ok(measure(line) <= 100, `"${line}"`);
  }
});
test("a word wider than the line is broken by character, and nothing is lost", () => {
  const lines = wrapLines("Supercalifragilistic", 80, measure, 5);
  assert.equal(lines.join(""), "Supercalifragilistic");
  assert.ok(lines.length >= 3);
});
test("too many lines: the last one ends with an ellipsis and still fits", () => {
  const lines = wrapLines("one two three four five six seven eight nine ten", 80, measure, 2);
  assert.equal(lines.length, 2);
  assert.ok(lines[1].endsWith("…"));
  assert.ok(lines.every((l) => measure(l) <= 80));
});
test("empty or blank text gives no lines; extra spaces are ignored", () => {
  assert.deepEqual(wrapLines("", 100, measure, 3), []);
  assert.deepEqual(wrapLines("   \n  ", 100, measure, 3), []);
  assert.deepEqual(wrapLines("  a    b  ", 100, measure, 3), ["a b"]);
});
test("a single-line limit with long text still returns one line that fits", () => {
  const [only, ...rest] = wrapLines("This is much too long to fit on one line", 120, measure, 1);
  assert.equal(rest.length, 0);
  assert.ok(measure(only) <= 120 && only.endsWith("…"));
});

console.log("file names");
test("names become safe, readable file names", () => {
  assert.equal(cardFileName("Café Nöir!"), "where-should-we-go-cafe-noir.png");
  assert.equal(cardFileName("The Clove Club"), "where-should-we-go-the-clove-club.png");
  assert.equal(cardFileName("日本料理"), "where-should-we-go-result.png");
  assert.equal(cardFileName("../../etc/passwd"), "where-should-we-go-etc-passwd.png");
  assert.ok(cardFileName("x".repeat(200)).length < 70);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
