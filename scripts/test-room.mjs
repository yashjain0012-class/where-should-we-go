// Run with: npm run test:room   (compiles lib/room.ts with tsc, then runs these checks)
import assert from "node:assert/strict";
import {
  MAX_ROOM_OPTIONS, applyVeto, canGuestVeto, isRoomCode, newRoomCode, parseGuestMessage, parseHostMessage, parseRoomHash,
  peerIdFor, roomHash, stateFor,
} from "../.test-build/room.js";

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
const opts = (n) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, name: `Option ${i}`, weight: 1 }));
const state = (over = {}) => ({ t: "state", v: 1, options: opts(3), people: 2, canVeto: true, ...over });

console.log("room codes and links");
test("codes are 6 readable characters, and different each time", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const c = newRoomCode();
    assert.match(c, /^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/);
    assert.ok(isRoomCode(c));
    seen.add(c);
  }
  assert.ok(seen.size > 195);
});
test("every letter of the alphabet gets used, roughly evenly", () => {
  const counts = new Map();
  for (let i = 0; i < 31000; i++) for (const ch of newRoomCode()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  assert.equal(counts.size, 31);
  const values = [...counts.values()];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  for (const v of values) assert.ok(Math.abs(v - mean) / mean < 0.06, `${v} vs ${mean}`);
});
test("a fixed random source gives a fixed code", () => {
  assert.equal(newRoomCode(() => 0), "aaaaaa");
  assert.equal(newRoomCode((n) => n - 1), "999999".replace(/9/g, "9"));
});
test("hash round trip, tolerance for chat punctuation and case, and rejection of the rest", () => {
  assert.equal(roomHash("abc234"), "#r=abc234");
  assert.equal(peerIdFor("abc234"), "wsg-abc234");
  assert.equal(parseRoomHash("#r=abc234"), "abc234");
  assert.equal(parseRoomHash("#r=ABC234"), "abc234");
  assert.equal(parseRoomHash("#r=abc234)."), "abc234");
  for (const bad of ["", "#r=", "#r=abc23", "#r=abc2345", "#r=abc0o1", "#r=ab c23", "#s=abc234", "r=abc234", "#r=abc234/../x", "#r=abc234&x=1"]) {
    assert.equal(parseRoomHash(bad), null, bad);
  }
  assert.equal(isRoomCode(undefined), false);
  assert.equal(isRoomCode(123456), false);
});

console.log("what a guest accepts");
test("a valid state", () => {
  const s = state();
  assert.deepEqual(parseHostMessage(s), s);
});
test("names are cleaned, bad ones refuse the whole message", () => {
  const cleaned = parseHostMessage(state({ options: [{ id: "a", name: "Bad‮Name\u0000 x", weight: 1 }, { id: "b", name: "B", weight: 2 }] }));
  assert.equal(cleaned.options[0].name, "Bad Name x");
  for (const bad of [
    { id: "", name: "x", weight: 1 }, { id: "a", name: "", weight: 1 }, { id: "a", name: "x".repeat(81), weight: 1 },
    { id: "a", name: "x", weight: 0 }, { id: "a", name: "x", weight: 6 }, { id: "a", name: "x", weight: 1.5 }, { id: "a", name: 5, weight: 1 },
    { id: "x".repeat(65), name: "x", weight: 1 }, null, "text", [],
  ]) {
    assert.equal(parseHostMessage(state({ options: [{ id: "ok", name: "ok", weight: 1 }, bad] })), null, JSON.stringify(bad));
  }
});
test("duplicate ids, too many or no options, wrong version, odd people counts are refused", () => {
  assert.equal(parseHostMessage(state({ options: [{ id: "a", name: "A", weight: 1 }, { id: "a", name: "B", weight: 1 }] })), null);
  assert.equal(parseHostMessage(state({ options: opts(MAX_ROOM_OPTIONS + 1) })), null);
  assert.ok(parseHostMessage(state({ options: opts(MAX_ROOM_OPTIONS) })));
  assert.equal(parseHostMessage(state({ options: [] })), null);
  assert.equal(parseHostMessage(state({ v: 2 })), null);
  for (const people of [0, -1, 1.5, 99, "3", null]) assert.equal(parseHostMessage(state({ people })), null, String(people));
  assert.equal(parseHostMessage(state({ canVeto: "yes" })), null);
});
test("spin messages: a winner and a sensible duration", () => {
  assert.deepEqual(parseHostMessage({ t: "spin", winnerId: "o1", ms: 5000 }), { t: "spin", winnerId: "o1", ms: 5000 });
  for (const bad of [
    { t: "spin", winnerId: "", ms: 5000 }, { t: "spin", winnerId: "o1", ms: 100 }, { t: "spin", winnerId: "o1", ms: 99_999 },
    { t: "spin", winnerId: "o1", ms: Number.NaN }, { t: "spin", winnerId: 1, ms: 5000 }, { t: "spin", ms: 5000 },
  ]) assert.equal(parseHostMessage(bad), null, JSON.stringify(bad));
});
test("closed, and anything unknown", () => {
  assert.deepEqual(parseHostMessage({ t: "closed" }), { t: "closed" });
  for (const bad of [null, undefined, 1, "state", [], {}, { t: "veto", id: "a" }, { t: "other" }]) assert.equal(parseHostMessage(bad), null);
});

console.log("what the host accepts");
test("a veto names one option; nothing else is accepted", () => {
  assert.deepEqual(parseGuestMessage({ t: "veto", id: "o1" }), { t: "veto", id: "o1" });
  for (const bad of [null, {}, { t: "veto" }, { t: "veto", id: "" }, { t: "veto", id: 3 }, { t: "veto", id: "x".repeat(65) }, { t: "spin", winnerId: "a", ms: 5000 }, "veto"]) {
    assert.equal(parseGuestMessage(bad), null, JSON.stringify(bad));
  }
  // extra fields are ignored, not passed on
  assert.deepEqual(parseGuestMessage({ t: "veto", id: "o1", extra: "<script>" }), { t: "veto", id: "o1" });
});

console.log("veto rules");
test("a veto removes exactly that option", () => {
  const r = applyVeto(opts(4), "o2", false);
  assert.ok(r.ok);
  assert.deepEqual(r.options.map((o) => o.id), ["o0", "o1", "o3"]);
});
test("one veto per guest, a real option, and never below two", () => {
  assert.deepEqual(applyVeto(opts(4), "o2", true), { ok: false, reason: "already-used" });
  assert.deepEqual(applyVeto(opts(4), "nope", false), { ok: false, reason: "unknown-option" });
  assert.deepEqual(applyVeto(opts(2), "o0", false), { ok: false, reason: "too-few" });
  assert.ok(applyVeto(opts(3), "o0", false).ok);
});
test("the state sent to each guest says whether they can still veto", () => {
  assert.equal(stateFor(opts(4), 3, false).canVeto, true);
  assert.equal(stateFor(opts(4), 3, true).canVeto, false);
  assert.equal(stateFor(opts(2), 3, false).canVeto, false);
  assert.equal(canGuestVeto(opts(3), false), true);
  assert.equal(stateFor(opts(4), 3, false).people, 3);
  assert.deepEqual(parseHostMessage(stateFor(opts(4), 3, false)), stateFor(opts(4), 3, false)); // what the host sends passes the guest's check
});
test("a sequence of vetoes by different guests ends at two options", () => {
  let options = opts(5);
  const used = new Set();
  for (const [guest, target] of [["g1", "o0"], ["g2", "o1"], ["g3", "o2"], ["g4", "o3"]]) {
    const r = applyVeto(options, target, used.has(guest));
    if (r.ok) {
      options = r.options;
      used.add(guest);
    }
  }
  assert.deepEqual(options.map((o) => o.id), ["o3", "o4"]);
  assert.equal(used.size, 3); // the fourth was refused: it would leave one option
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
