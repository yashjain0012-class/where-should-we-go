// Run with: npm run test:spin   (compiles lib/spin.ts and lib/ticks.ts with tsc, then runs these checks)
import assert from "node:assert/strict";
import { pickWeighted, sliceEdges, sliceUnderPointer, targetRotation } from "../.test-build/spin.js";
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
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ""} expected ${b} got ${a}`);

console.log("slice edges");
test("equal slices", () => {
  assert.deepEqual(sliceEdges(4), [0, 90, 180, 270, 360]);
});
test("weights set the slice sizes, and the last edge is exactly 360", () => {
  const edges = sliceEdges([2, 1, 1]);
  assert.deepEqual(edges, [0, 180, 270, 360]);
  assert.equal(sliceEdges([1, 1, 1]).at(-1), 360);
  assert.equal(sliceEdges([0.1, 0.2, 0.3]).at(-1), 360);
});

console.log("weighted pick");
test("the roll maps to slices in order", () => {
  assert.equal(pickWeighted([2, 1, 1], 0), 0);
  assert.equal(pickWeighted([2, 1, 1], 0.49), 0);
  assert.equal(pickWeighted([2, 1, 1], 0.5), 1);
  assert.equal(pickWeighted([2, 1, 1], 0.74), 1);
  assert.equal(pickWeighted([2, 1, 1], 0.75), 2);
  assert.equal(pickWeighted([2, 1, 1], 0.999999), 2);
});
test("over 20,000 spins, wins track slice size", () => {
  const weights = [2, 1, 1, 2, 1];
  const total = weights.reduce((a, b) => a + b, 0);
  const wins = weights.map(() => 0);
  const N = 20000;
  for (let i = 0; i < N; i++) wins[pickWeighted(weights)]++;
  weights.forEach((w, i) => near(wins[i] / N, w / total, 0.015, `slice ${i}`));
});

console.log("landing");
test("the wheel always stops with the chosen slice under the pointer, even/uneven", () => {
  for (const slices of [5, 8, [2, 1, 1], [2, 1, 1, 2, 1, 1, 1, 1], [1, 2]]) {
    const count = typeof slices === "number" ? slices : slices.length;
    let rotation = 0;
    for (let spin = 0; spin < 300; spin++) {
      const index = spin % count;
      const to = targetRotation(rotation, index, slices, 5);
      assert.ok(to - rotation >= 5 * 360 - 1e-9, "at least five turns");
      assert.equal(sliceUnderPointer(to, slices), index, `${JSON.stringify(slices)} spin ${spin}`);
      rotation = to;
    }
  }
});
test("it never lands on an edge: the jitter keeps it inside the middle of the slice", () => {
  const weights = [3, 1, 1];
  const edges = sliceEdges(weights);
  for (let i = 0; i < 500; i++) {
    const to = targetRotation(0, 1, weights, 5);
    const angle = (((-to) % 360) + 360) % 360;
    assert.ok(angle > edges[1] + 0.15 * (edges[2] - edges[1]) - 1e-6 && angle < edges[2] - 0.15 * (edges[2] - edges[1]) + 1e-6, `angle ${angle}`);
  }
});

console.log("ticks on an uneven wheel");
test("one tick per edge passing the pointer", () => {
  const T = 5000;
  const weights = [2, 1, 1];
  const start = 0;
  const end = targetRotation(start, 2, weights, 5);
  const times = tickTimes(start, end, sliceEdges(weights), T, 0);
  // Three edges per turn; the count is how many edge crossings fall in (start, end].
  const edges = sliceEdges(weights).slice(0, -1);
  let expected = 0;
  for (let turn = 0; turn <= Math.ceil(end / 360); turn++) for (const e of edges) {
    const at = 360 * turn - e;
    if (at > start && at <= end) expected++;
  }
  assert.equal(times.length, expected);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] >= times[i - 1], "in order");
});
test("with equal weights it matches the equal-slice calculation", () => {
  const T = 5000;
  const a = tickTimes(137.3, 2863.9, 360 / 6, T, 0);
  const b = tickTimes(137.3, 2863.9, sliceEdges(6), T, 0);
  assert.equal(a.length, b.length);
  a.forEach((t, i) => near(b[i], t, 1e-6, `tick ${i}`));
});
test("each tick is the moment an edge reaches the pointer", () => {
  const T = 5000;
  const weights = [3, 1, 2];
  const edges = sliceEdges(weights);
  const start = 40;
  const end = targetRotation(start, 0, weights, 5);
  const times = tickTimes(start, end, edges, T, 0);
  // At each tick time the wheel's angle must be (nearly) a multiple of 360 minus an edge.
  // Rebuild the rotation from the same easing the CSS uses.
  return import("../.test-build/ticks.js").then(({ spinRotation }) => {
    for (const t of times) {
      const rot = spinRotation(start, end, t * 1000, T);
      const angle = (((-rot) % 360) + 360) % 360;
      const dist = Math.min(...edges.map((e) => Math.min(Math.abs(angle - e), 360 - Math.abs(angle - e))));
      assert.ok(dist < 0.05, `tick at ${t}s is ${dist} degrees from an edge`);
    }
  });
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
