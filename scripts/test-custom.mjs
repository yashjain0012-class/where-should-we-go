// Run with: npm run test:custom   (compiles lib/custom.ts with tsc, then runs these checks)
import assert from "node:assert/strict";
import {
  MAX_CUSTOM_HASH, MAX_ITEMS, MAX_NAME, customPlaces, customToText, decodeCustom, encodeCustom, parseCustomText,
} from "../.test-build/custom.js";

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

console.log("typing a list");
test("one option per line, with optional weights", () => {
  const { items, notes } = parseCustomText("Pizza\nTacos x2\n  Sushi *3 \nRamen ×4\n\n");
  assert.deepEqual(items, [
    { name: "Pizza", weight: 1 }, { name: "Tacos", weight: 2 }, { name: "Sushi", weight: 3 }, { name: "Ramen", weight: 4 },
  ]);
  assert.deepEqual(notes, []);
});
test("a single comma-separated line is a list too; CRLF is fine", () => {
  assert.deepEqual(parseCustomText("pizza, tacos ,sushi").items.map((i) => i.name), ["pizza", "tacos", "sushi"]);
  assert.deepEqual(parseCustomText("a\r\nb\r\n").items.map((i) => i.name), ["a", "b"]);
});
test("commas inside a multi-line list stay in the names", () => {
  assert.deepEqual(parseCustomText("Salt, Pepper\nBread").items.map((i) => i.name), ["Salt, Pepper", "Bread"]);
});
test("names that merely end in x or a number are not weights", () => {
  assert.deepEqual(parseCustomText("Apex\nStudio 54\nBox\nFormula x").items.map((i) => [i.name, i.weight]),
    [["Apex", 1], ["Studio 54", 1], ["Box", 1], ["Formula x", 1]]);
  assert.deepEqual(parseCustomText("x3").items, [{ name: "x3", weight: 1 }]); // nothing left of the name: keep it whole
});
test("weights are capped at 5 and a note says so", () => {
  const { items, notes } = parseCustomText("Big x99\nSmall x0");
  assert.deepEqual(items.map((i) => i.weight), [5, 1]);
  assert.equal(notes.length, 1);
});
test("repeats (any case) are left out, extra names beyond 12 dropped, long names shortened", () => {
  const lines = ["Pizza", "pizza", "PIZZA x2", ...Array.from({ length: 14 }, (_, i) => `Option ${i}`), "y".repeat(80)];
  const { items, notes } = parseCustomText(lines.join("\n"));
  assert.equal(items.length, MAX_ITEMS);
  assert.equal(items.filter((i) => i.name.toLowerCase() === "pizza").length, 1);
  assert.ok(notes.some((n) => n.includes("repeated")));
  assert.ok(notes.some((n) => n.includes(`first ${MAX_ITEMS}`)));
  const long = parseCustomText("y".repeat(80));
  assert.equal(long.items[0].name.length, MAX_NAME);
  assert.ok(long.notes.some((n) => n.includes("shortened")));
});
test("control characters and bidi overrides are cleaned out of names", () => {
  const { items } = parseCustomText("Bad‮Name\u0000 here\nOk");
  assert.deepEqual(items.map((i) => i.name), ["Bad Name here", "Ok"]);
});
test("text and list round trip", () => {
  const items = [{ name: "A", weight: 1 }, { name: "B", weight: 3 }];
  assert.equal(customToText(items), "A\nB x3");
  assert.deepEqual(parseCustomText(customToText(items)).items, items);
});
test("wheel entries have stable ids and no location", () => {
  assert.deepEqual(customPlaces([{ name: "A", weight: 1 }, { name: "B", weight: 2 }]).map((p) => [p.id, p.name]), [["custom-0", "A"], ["custom-1", "B"]]);
});

console.log("share links for custom lists");
const items = [{ name: "Pizza", weight: 1 }, { name: "Tacos 🌮", weight: 3 }, { name: "Crêpes & café", weight: 2 }];
test("round trip, including emoji and accents", () => {
  const hash = encodeCustom(items);
  assert.ok(hash.startsWith("#c=1."));
  assert.deepEqual(decodeCustom(hash), items);
});
test("trailing punctuation from a chat app is tolerated", () => {
  assert.deepEqual(decodeCustom(encodeCustom(items) + ")."), items);
});
test("a full list fits the link budget", () => {
  const full = Array.from({ length: MAX_ITEMS }, (_, i) => ({ name: `${i}`.padEnd(MAX_NAME, "é"), weight: 5 }));
  const hash = encodeCustom(full);
  assert.ok(hash.length <= MAX_CUSTOM_HASH, `${hash.length} chars`);
  assert.deepEqual(decodeCustom(hash), full);
});
test("broken, truncated, tampered or wrong links give null", () => {
  const hash = encodeCustom(items);
  const bad = [
    "", "#c=", "#c=1", "#c=1.x.y", "#s=1.a.b", hash.slice(0, -4), hash.replace("#c=1.", "#c=2."),
    hash.slice(0, hash.length - 1) + (hash.endsWith("A") ? "B" : "A"), // one changed character
    "#c=1.abc.!!!!",
  ];
  for (const b of bad) assert.equal(decodeCustom(b), null, b);
});
test("a well-formed link with out-of-range content is rejected", () => {
  // Build links with valid checksums but bad data, by encoding and swapping the payload and checksum together.
  const forge = (rows) => {
    const payload = Buffer.from(JSON.stringify(rows)).toString("base64url");
    let h = 0x811c9dc5;
    for (let i = 0; i < payload.length; i++) { h ^= payload.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return `#c=1.${h.toString(36)}.${payload}`;
  };
  assert.ok(decodeCustom(forge([["ok", 1]])), "the forgery helper makes valid links");
  for (const rows of [[], "x", [["a"]], [["a", 0]], [["a", 6]], [["a", 1.5]], [["a", "1"]], [[1, 1]], [["", 1]], [["x".repeat(41), 1]],
    Array.from({ length: 13 }, (_, i) => [`o${i}`, 1]), [["a", 1, 2]]]) {
    assert.equal(decodeCustom(forge(rows)), null, JSON.stringify(rows));
  }
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
