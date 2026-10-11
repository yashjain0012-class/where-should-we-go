// Run with: npm run test:bracket   (compiles lib/bracket.ts with tsc, then runs these checks)
import assert from "node:assert/strict";
import { MAX_ENTRANTS, champion, createBracket, nextMatch, pick, roundName, votesLeft } from "../.test-build/bracket.js";

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
const ids = (n) => Array.from({ length: n }, (_, i) => `p${i}`);
/** A repeatable pseudo-random source. */
const seeded = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

/** Play a whole tournament, always choosing with `choose(match)`. Returns the votes cast and the champion. */
function play(bracket, choose) {
  let votes = 0;
  for (let m = nextMatch(bracket); m; m = nextMatch(bracket)) {
    bracket = pick(bracket, choose(m));
    votes++;
    assert.ok(votes <= 100, "runaway");
  }
  return { votes, champion: champion(bracket), bracket };
}

console.log("building");
test("2 options: one match, the final", () => {
  const b = createBracket(ids(2));
  assert.equal(b.rounds.length, 1);
  assert.equal(roundName(b, 0), "Final");
  assert.deepEqual([nextMatch(b).a, nextMatch(b).b].sort(), ["p0", "p1"]);
});
test("4 options: semi-finals then a final; 8: quarter-finals first", () => {
  const four = createBracket(ids(4));
  assert.deepEqual(four.rounds.map((r) => r.length), [2, 1]);
  assert.deepEqual([0, 1].map((r) => roundName(four, r)), ["Semi-final", "Final"]);
  const eight = createBracket(ids(8));
  assert.deepEqual([0, 1, 2].map((r) => roundName(eight, r)), ["Quarter-final", "Semi-final", "Final"]);
  assert.equal(roundName(createBracket(ids(16)), 0), "Round 1");
});
test("everyone is in the bracket exactly once, in the first round", () => {
  for (let n = 2; n <= MAX_ENTRANTS; n++) {
    const b = createBracket(ids(n), seeded(n));
    const entrants = b.rounds[0].flatMap((m) => [m.a, m.b]).filter((x) => x !== null);
    assert.deepEqual([...entrants].sort(), ids(n).sort(), `n=${n}`);
  }
});
test("the order is shuffled", () => {
  const orders = new Set();
  for (let s = 1; s <= 30; s++) orders.add(JSON.stringify(createBracket(ids(8), seeded(s)).rounds[0]));
  assert.ok(orders.size > 20);
});
test("rejects too few, too many and repeated options", () => {
  assert.throws(() => createBracket(["a"]));
  assert.throws(() => createBracket([]));
  assert.throws(() => createBracket(ids(17)));
  assert.throws(() => createBracket(["a", "a"]));
});

console.log("playing");
test("any number of options takes exactly n-1 votes, whoever you pick", () => {
  for (let n = 2; n <= MAX_ENTRANTS; n++) {
    for (const side of ["a", "b"]) {
      const { votes, champion: c } = play(createBracket(ids(n), seeded(n * 7)), (m) => m[side]);
      assert.equal(votes, n - 1, `n=${n}`);
      assert.ok(ids(n).includes(c));
    }
  }
});
test("byes need no vote and nobody gets two byes", () => {
  const b = createBracket(ids(5), seeded(3)); // 8 slots, 3 byes
  const byes = b.rounds[0].filter((m) => (m.a === null) !== (m.b === null));
  assert.equal(byes.length, 3);
  assert.ok(byes.every((m) => m.winner !== null), "bye winners are decided up front");
  assert.equal(b.rounds[0].filter((m) => m.a === null && m.b === null).length, 0);
  assert.equal(votesLeft(b), 4);
});
test("an option that is picked every time it appears wins the whole thing", () => {
  const favourite = "p2";
  const { champion: c } = play(createBracket(ids(8), seeded(9)), (m) => (m.a === favourite || m.b === favourite ? favourite : m.a));
  assert.equal(c, favourite);
});
test("an invalid pick changes nothing; the original bracket is never mutated", () => {
  const b = createBracket(ids(4), seeded(1));
  const snapshot = JSON.stringify(b);
  assert.equal(pick(b, "nobody"), b);
  assert.equal(pick(b, ids(4).find((x) => x !== nextMatch(b).a && x !== nextMatch(b).b)), b); // someone in a later match
  const m = nextMatch(b);
  const after = pick(b, m.a);
  assert.equal(JSON.stringify(b), snapshot);
  assert.notEqual(after, b);
});
test("votesLeft counts down to zero and there is no next match at the end", () => {
  let b = createBracket(ids(6), seeded(5));
  let left = votesLeft(b);
  assert.equal(left, 5);
  while (nextMatch(b)) {
    b = pick(b, nextMatch(b).a);
    assert.equal(votesLeft(b), --left);
  }
  assert.equal(left, 0);
  assert.ok(champion(b));
  assert.equal(pick(b, "p0"), b); // nothing left to decide
});
test("no champion until the end", () => {
  const b = createBracket(ids(4), seeded(2));
  assert.equal(champion(b), null);
  assert.equal(champion(pick(b, nextMatch(b).a)), null);
});
test("with random votes every option can win", () => {
  const rand = seeded(11);
  const winners = new Set();
  for (let i = 0; i < 400; i++) winners.add(play(createBracket(ids(5), rand), (m) => (rand() < 0.5 ? m.a : m.b)).champion);
  assert.equal(winners.size, 5);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
