// Run with: npm run test:motion   (compiles lib/motion.ts with tsc, then runs these checks)
import assert from "node:assert/strict";
import { createShakeDetector, feltTicks } from "../.test-build/motion.js";
import { tickTimes } from "../.test-build/ticks.js";

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

console.log("vibration ticks");
test("fast ticks are thinned out, slow ones all kept", () => {
  const times = [0.0, 0.03, 0.06, 0.1, 0.2, 0.35, 0.6, 1.0];
  assert.deepEqual(feltTicks(times, 110), [0, 0.2, 0.35, 0.6, 1.0]);
  assert.deepEqual(feltTicks([], 110), []);
  assert.deepEqual(feltTicks([0.5], 110), [0.5]);
});
test("on a real spin the felt ticks never come closer than the gap, and keep the final slow ones", () => {
  const times = tickTimes(0, 2520, 45, 5000, 25);
  const felt = feltTicks(times, 110);
  assert.ok(felt.length > 5 && felt.length < times.length, `${felt.length} of ${times.length}`);
  for (let i = 1; i < felt.length; i++) assert.ok((felt[i] - felt[i - 1]) * 1000 >= 110 - 1e-6);
  // the last tick of the spin is slow, so it is felt
  assert.equal(felt.at(-1), times.at(-1));
});

console.log("shake detection");
/** Feed `count` hard jolts, `gap` ms apart, starting at `start`. Returns the times a shake was reported. */
function jolts(feed, start, count, gap, magnitude = 30) {
  const found = [];
  for (let i = 0; i < count; i++) if (feed(magnitude, start + i * gap)) found.push(start + i * gap);
  return found;
}
test("three hard jolts close together are a shake", () => {
  const feed = createShakeDetector();
  assert.deepEqual(jolts(feed, 1000, 3, 200), [1400]);
});
test("a phone at rest, or gently moved, never shakes", () => {
  const feed = createShakeDetector();
  for (let t = 0; t < 10_000; t += 16) assert.equal(feed(9.8 + 3 * Math.sin(t / 300), t), false);
});
test("one bump, or two, is not a shake", () => {
  assert.deepEqual(jolts(createShakeDetector(), 0, 1, 200), []);
  assert.deepEqual(jolts(createShakeDetector(), 0, 2, 200), []);
});
test("jolts spread too far apart are not a shake", () => {
  assert.deepEqual(jolts(createShakeDetector(), 0, 5, 700), []);
});
test("the many readings of one jolt count once", () => {
  const feed = createShakeDetector();
  let shakes = 0;
  for (let t = 0; t < 100; t += 10) if (feed(35, t)) shakes++; // ten readings in 100 ms: one jolt
  assert.equal(shakes, 0);
});
test("after a shake there is a lockout, then it works again", () => {
  const feed = createShakeDetector({ lockoutMs: 1500 });
  assert.equal(jolts(feed, 0, 3, 200).length, 1);
  assert.deepEqual(jolts(feed, 700, 6, 200), []); // still locked out
  assert.equal(jolts(feed, 5000, 3, 200).length, 1);
});
test("bad readings are ignored", () => {
  const feed = createShakeDetector();
  for (let t = 0; t < 2000; t += 200) assert.equal(feed(Number.NaN, t), false);
  for (let t = 5000; t < 5800; t += 200) assert.equal(feed(Number.POSITIVE_INFINITY, t), false);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
