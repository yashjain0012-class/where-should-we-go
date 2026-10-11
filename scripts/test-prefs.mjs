// Run with: npm run test:prefs   (compiles lib/prefs.ts with tsc, then runs these checks)
import assert from "node:assert/strict";

// A tiny stand-in for the browser, since the store uses window.localStorage.
const storage = new Map();
const listeners = [];
globalThis.window = {
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => void storage.set(k, v),
    removeItem: (k) => void storage.delete(k),
  },
  addEventListener: (type, fn) => type === "storage" && listeners.push(fn),
  removeEventListener: () => {},
};
const P = await import("../.test-build/prefs.js");

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
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 11, 20, 0, 0);

console.log("reading storage");
test("nothing stored gives the defaults", () => {
  const p = P.parsePrefs(null);
  assert.deepEqual(p.favourites, {});
  assert.deepEqual(p.hidden, {});
  assert.deepEqual(p.history, []);
  assert.equal(p.skipDays, 14);
});
test("garbage, wrong versions and wrong types fall back to the defaults", () => {
  for (const raw of ["", "not json", "null", "42", "[]", '{"v":2}', '{"v":1,"favourites":5,"hidden":[],"history":"x","skipDays":"a"}']) {
    const p = P.parsePrefs(raw);
    assert.deepEqual(p.favourites, {}, raw);
    assert.deepEqual(p.history, [], raw);
    assert.equal(p.skipDays, 14, raw);
  }
});
test("bad entries are dropped, good ones kept, names cleaned and capped", () => {
  const raw = JSON.stringify({
    v: 1,
    favourites: { a: "Good", b: 7, c: "   ", d: "Line\nbreak", e: "x".repeat(500) },
    hidden: { z: "Hidden" },
    history: [{ id: "a", name: "Old", at: 1000 }, { id: "b", name: "New", at: 5000 }, { id: 9, name: "Bad", at: 1 }, { id: "c", name: "NaN", at: null }],
    skipDays: 7,
  });
  const p = P.parsePrefs(raw);
  assert.deepEqual(Object.keys(p.favourites), ["a", "d", "e"]);
  assert.equal(p.favourites.d, "Line break");
  assert.equal(p.favourites.e.length, 120);
  assert.deepEqual(p.history.map((h) => h.name), ["New", "Old"]); // newest first
  assert.equal(p.skipDays, 7);
});
test("an unknown skip-days value is replaced with the default", () => {
  assert.equal(P.parsePrefs('{"v":1,"skipDays":5}').skipDays, 14);
  assert.equal(P.parsePrefs('{"v":1,"skipDays":0}').skipDays, 0);
});
test("lists are capped", () => {
  const history = Array.from({ length: 80 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, at: i }));
  assert.equal(P.parsePrefs(JSON.stringify({ v: 1, history })).history.length, 50);
});

console.log("what stays off the wheel");
test("hidden places and recent winners are excluded; old winners are not", () => {
  const p = P.parsePrefs(JSON.stringify({
    v: 1,
    hidden: { h: "Hidden" },
    history: [{ id: "recent", name: "R", at: NOW - 3 * DAY }, { id: "old", name: "O", at: NOW - 20 * DAY }],
    skipDays: 14,
  }));
  const out = P.excludedIds(p, NOW);
  assert.deepEqual([...out].sort(), ["h", "recent"]);
});
test("skip days of 0 only excludes hidden places", () => {
  const p = P.parsePrefs(JSON.stringify({ v: 1, hidden: { h: "H" }, history: [{ id: "recent", name: "R", at: NOW }], skipDays: 0 }));
  assert.deepEqual([...P.excludedIds(p, NOW)], ["h"]);
});
test("favourites weigh double", () => {
  const p = P.parsePrefs(JSON.stringify({ v: 1, favourites: { b: "B" } }));
  assert.deepEqual(P.weightsFor([{ id: "a" }, { id: "b" }, { id: "c" }], p), [1, 2, 1]);
});

console.log("changing and saving");
test("starring, hiding and unhiding persist and contradict nothing", () => {
  P.clearPrefs();
  P.toggleFavourite({ id: "x", name: "Cafe X" });
  assert.ok("x" in P.getPrefs().favourites);
  P.hidePlace({ id: "x", name: "Cafe X" });
  assert.ok(!("x" in P.getPrefs().favourites), "hiding unstars");
  assert.ok("x" in P.getPrefs().hidden);
  P.toggleFavourite({ id: "x", name: "Cafe X" });
  assert.ok(!("x" in P.getPrefs().hidden), "starring unhides");
  P.toggleFavourite({ id: "x", name: "Cafe X" });
  assert.ok(!("x" in P.getPrefs().favourites), "toggling again unstars");
  P.hidePlace({ id: "y", name: "Bar Y" });
  P.unhidePlace("y");
  assert.deepEqual(P.getPrefs().hidden, {});
  // And what was saved reads back the same.
  P.toggleFavourite({ id: "k", name: "Keep" });
  assert.deepEqual(P.parsePrefs(storage.get("wsg-prefs")).favourites, { k: "Keep" });
});
test("winners are recorded newest first, and capped", () => {
  P.clearPrefs();
  P.recordWinner({ id: "a", name: "A" }, 1000);
  P.recordWinner({ id: "b", name: "B" }, 2000);
  assert.deepEqual(P.getPrefs().history.map((h) => h.id), ["b", "a"]);
  for (let i = 0; i < 70; i++) P.recordWinner({ id: `p${i}`, name: `P${i}` }, 3000 + i);
  assert.equal(P.getPrefs().history.length, 50);
});
test("skip days only accepts the offered choices", () => {
  P.clearPrefs();
  P.setSkipDays(30);
  assert.equal(P.getPrefs().skipDays, 30);
  P.setSkipDays(5);
  assert.equal(P.getPrefs().skipDays, 30);
});
test("subscribers hear about every change", () => {
  P.clearPrefs();
  let calls = 0;
  const off = P.subscribePrefs(() => calls++);
  P.toggleFavourite({ id: "n", name: "N" });
  P.recordWinner({ id: "n", name: "N" });
  off();
  assert.equal(calls, 2);
});
test("clearing forgets everything, including the stored copy", () => {
  P.toggleFavourite({ id: "n", name: "N" });
  P.clearPrefs();
  assert.equal(P.hasAnyData(P.getPrefs()), false);
  assert.equal(storage.has("wsg-prefs"), false);
});
test("blocked storage still works for the visit", () => {
  const real = globalThis.window.localStorage;
  globalThis.window.localStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
  };
  try {
    P.clearPrefs();
    P.toggleFavourite({ id: "q", name: "Q" });
    assert.ok("q" in P.getPrefs().favourites);
    P.clearPrefs();
    assert.equal(P.hasAnyData(P.getPrefs()), false);
  } finally {
    globalThis.window.localStorage = real;
  }
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
