// Run with: npm run test:ticks   (compiles lib/ticks.ts with tsc, then runs these checks)
import assert from "node:assert/strict";
import { cubicBezier, tickTimes, spinRotation, SPIN_BEZIER, cssSpinEasing } from "../.test-build/ticks.js";

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
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b} got ${a}`);

console.log("easing curve");
test("matches the CSS spec's built-in curves", () => {
  // CSS "ease" is cubic-bezier(0.25, 0.1, 0.25, 1): at the halfway time it is ~80% done.
  const ease = cubicBezier(0.25, 0.1, 0.25, 1);
  near(ease(0.5), 0.8024, 0.002, "ease(0.5)");
  near(ease(0.25), 0.4094, 0.002, "ease(0.25)");
  // "ease-in-out" (0.42, 0, 0.58, 1) is symmetric about the middle.
  const inOut = cubicBezier(0.42, 0, 0.58, 1);
  near(inOut(0.5), 0.5, 1e-4, "ease-in-out(0.5)");
  near(inOut(0.2) + inOut(0.8), 1, 1e-4, "ease-in-out symmetry");
  // A straight line stays a straight line.
  const linear = cubicBezier(0, 0, 1, 1);
  for (const t of [0.1, 0.37, 0.9]) near(linear(t), t, 1e-5, "linear");
});
test("spin curve starts at 0, ends at 1, never goes backwards", () => {
  const ease = cubicBezier(...SPIN_BEZIER);
  assert.equal(ease(0), 0);
  assert.equal(ease(1), 1);
  let prev = 0;
  for (let i = 1; i <= 1000; i++) {
    const v = ease(i / 1000);
    assert.ok(v >= prev - 1e-9, `decreased at ${i}`);
    prev = v;
  }
});
test("the CSS timing function string is built from the same numbers", () => {
  assert.equal(cssSpinEasing(), "cubic-bezier(0.12, 0.6, 0.1, 1)");
});

console.log("tick schedule");
const T = 5000;
test("one tick per slice boundary passed (no spacing filter)", () => {
  // 7 full turns of a 8-slice wheel: boundaries every 45 degrees
  assert.equal(tickTimes(0, 2520, 45, T, 0).length, 56);
  // an arbitrary start and end: count the multiples of 45 in (1000.5, 3000.2]
  assert.equal(tickTimes(1000.5, 3000.2, 45, T, 0).length, Math.floor(3000.2 / 45) - Math.floor(1000.5 / 45));
  // a 2-slice wheel
  assert.equal(tickTimes(0, 1800, 180, T, 0).length, 10);
});
test("times are strictly increasing and inside the spin", () => {
  const times = tickTimes(137.3, 2863.9, 360 / 7, T, 0);
  assert.ok(times.length > 30);
  times.forEach((t, i) => {
    assert.ok(t > 0 && t <= T / 1000, `tick ${i} at ${t}s`);
    if (i) assert.ok(t > times[i - 1], "increasing");
  });
});
test("ticks slow down as the wheel does: gaps grow, last gap is much longer than the first", () => {
  const times = tickTimes(0, 2520, 45, T, 0);
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const q = Math.floor(gaps.length / 4);
  assert.ok(mean(gaps.slice(0, q)) < mean(gaps.slice(q, 2 * q)));
  assert.ok(mean(gaps.slice(q, 2 * q)) < mean(gaps.slice(2 * q, 3 * q)));
  assert.ok(mean(gaps.slice(2 * q, 3 * q)) < mean(gaps.slice(3 * q)));
  assert.ok(gaps.at(-1) > gaps[0] * 10, `last gap ${gaps.at(-1)}s vs first ${gaps[0]}s`);
});
test("each tick happens exactly when the wheel model has a boundary under the pointer", () => {
  const start = 211.7;
  const end = 2761.3;
  const slice = 45;
  for (const t of tickTimes(start, end, slice, T, 0)) {
    const angle = spinRotation(start, end, t * 1000, T);
    const offBoundary = Math.abs(((angle % slice) + slice) % slice);
    const dist = Math.min(offBoundary, slice - offBoundary);
    assert.ok(dist < 0.05, `at ${t}s the wheel is ${dist} degrees from a boundary`);
  }
});
test("the 25 ms spacing rule drops only the blurry early ticks", () => {
  const all = tickTimes(0, 2520, 45, T, 0);
  const spaced = tickTimes(0, 2520, 45, T, 25);
  assert.ok(spaced.length < all.length && spaced.length > all.length * 0.6, `${spaced.length} of ${all.length}`);
  spaced.forEach((t, i) => {
    if (i) assert.ok((t - spaced[i - 1]) * 1000 >= 25 - 1e-9);
  });
  assert.deepEqual(spaced.slice(-10), all.slice(-10), "slow ticks at the end are all kept");
});
test("a shorter (reduced-motion) spin scales the schedule to its duration", () => {
  const times = tickTimes(0, 720, 45, 1200, 25);
  assert.ok(times.length >= 8 && times.at(-1) <= 1.2);
});
test("degenerate input gives no ticks", () => {
  assert.deepEqual(tickTimes(100, 100, 45, T), []);
  assert.deepEqual(tickTimes(500, 100, 45, T), []);
  assert.deepEqual(tickTimes(0, 360, 0, T), []);
  assert.deepEqual(tickTimes(0, 360, 45, 0), []);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
