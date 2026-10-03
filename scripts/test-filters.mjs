// Run with: npm run test:filters   (compiles the lib modules with tsc, then runs these checks)
// Tip: run it under different machine time zones to prove results don't depend on them:
//   TZ=Asia/Kolkata npm run test:filters
import assert from "node:assert/strict";
import { ringsFor, buildQuery, boundingBox, parseCandidates, RING_CAP } from "../.test-build/overpass.js";
import { snapRadius, formatRadius, CATEGORIES, POOL_SIZE } from "../.test-build/categories.js";
import { openStateOf, placeLocalDate, openStates, loadOpeningHours } from "../.test-build/hours.js";

let passed = 0;
function test(name, fn) {
  const done = () => {
    passed++;
    console.log(`  ok   ${name}`);
  };
  const fail = (err) => {
    process.exitCode = 1;
    console.error(`  FAIL ${name}\n       ${err.message}`);
  };
  try {
    const r = fn();
    if (r && typeof r.then === "function") return r.then(done, fail);
    done();
  } catch (err) {
    fail(err);
  }
}

console.log("radius helpers");
test("snapRadius clamps and snaps to 250 m steps", () => {
  assert.equal(snapRadius(100), 500);
  assert.equal(snapRadius(499), 500);
  assert.equal(snapRadius(1100), 1000);
  assert.equal(snapRadius(1130), 1250);
  assert.equal(snapRadius(5001), 5000);
  assert.equal(snapRadius(99999), 5000);
});
test("formatRadius", () => {
  assert.equal(formatRadius(500), "500 m");
  assert.equal(formatRadius(750), "750 m");
  assert.equal(formatRadius(1000), "1 km");
  assert.equal(formatRadius(2500), "2.5 km");
});

console.log("rings and query");
test("ringsFor ends exactly at the radius", () => {
  assert.deepEqual(ringsFor(500), [250, 500]);
  assert.deepEqual(ringsFor(750), [250, 500, 750]);
  assert.deepEqual(ringsFor(1000), [250, 500, 1000]);
  assert.deepEqual(ringsFor(1250), [250, 500, 1000, 1250]);
  assert.deepEqual(ringsFor(2500), [250, 500, 1000, 1500, 2000, 2500]);
  assert.deepEqual(ringsFor(5000), [250, 500, 1000, 1500, 2000, 3000, 4000, 5000]);
  assert.ok(ringsFor(250).length === 1 && ringsFor(250)[0] === 250, "degenerate small radius still ends at the radius");
});
test("scan is a bounding box (fast on the public servers), trimmed to a circle by the rings", () => {
  const q = buildQuery(51.525, -0.078, ['["amenity"="bar"]', '["amenity"="pub"]'], 1500, 20);
  const box = boundingBox(51.525, -0.078, 1500);
  for (const piece of [
    "[out:json][timeout:20];",
    `nwr["amenity"="bar"]["name"]${box};`,
    `nwr["amenity"="pub"]["name"]${box};`,
    ")->.all;",
    "nwr.all(around:250,51.525,-0.078)->.r1;",
    "nwr.all(around:500,51.525,-0.078)->.r2;",
    "nwr.all(around:1000,51.525,-0.078)->.r3;",
    "nwr.all(around:1500,51.525,-0.078)->.r4;",
    "(.r2; - .r1;)->.a2;",
    "(.r3; - .r2;)->.a3;",
    "(.r4; - .r3;)->.a4;",
    `.r1 out center ${RING_CAP};`,
    `.a2 out center ${RING_CAP};`,
    `.a3 out center ${RING_CAP};`,
    `.a4 out center ${RING_CAP};`,
  ]) {
    assert.ok(q.includes(piece), `missing: ${piece}`);
  }
  const scanLines = q.split("\n").filter((l) => l.startsWith("  nwr"));
  assert.equal(scanLines.length, 2);
  assert.ok(scanLines.every((l) => !l.includes("around")), "the slow around-scan must not be used for the scan");
});
test("bounding box is centred, grows with the radius, and stays on the globe", () => {
  const parse = (s) => s.slice(1, -1).split(",").map(Number); // south, west, north, east
  const [s, w, n, e] = parse(boundingBox(51.5, -0.1, 1000));
  assert.ok(Math.abs((s + n) / 2 - 51.5) < 1e-4 && Math.abs((w + e) / 2 + 0.1) < 1e-4);
  assert.ok(Math.abs((n - s) * 111320 - 2000) < 5, "height is two radii");
  assert.ok(e - w > n - s, "longitude span is wider than latitude span at this latitude");
  const [s2, , n2] = parse(boundingBox(89.99, 0, 5000));
  assert.ok(n2 <= 90 && s2 >= -90);
  const [, w3, , e3] = parse(boundingBox(0, 179.99, 5000));
  assert.ok(e3 <= 180 && w3 >= -180);
});
test("even the smallest radius still produces ring sets that trim the box to a circle", () => {
  const q = buildQuery(1, 2, ['["amenity"="cafe"]'], 250, 20);
  assert.ok(q.includes("nwr.all(around:250,1,2)->.r1;"));
  assert.ok(q.includes(`.r1 out center ${RING_CAP};`));
  assert.ok(!q.includes(".a2"));
});
test("every category produces printable-ASCII queries, one scan line per filter", () => {
  for (const c of CATEGORIES) {
    const q = buildQuery(51.5, -0.1, c.filters, 5000, 28);
    assert.equal(q.split("\n").filter((l) => l.startsWith("  nwr")).length, c.filters.length);
    assert.ok(/^[\x20-\x7e\n]+$/.test(q), "printable ASCII only");
  }
});

console.log("candidates");
const C = { lat: 51.5, lon: -0.1 };
const el = (id, name, dLat, extra = {}) => ({
  type: "node",
  id,
  lat: C.lat + dLat,
  lon: C.lon,
  tags: { name, ...extra },
});
test("sorted nearest first, de-duplicated by name keeping the nearest", () => {
  const out = parseCandidates(
    [el(1, "Far", 0.02), el(2, "Near", 0.001), el(3, "Mid", 0.01), el(4, "near", 0.0005), el(5, "Far", 0.001)],
    C,
  );
  assert.deepEqual(out.map((p) => p.id), ["node/4", "node/5", "node/3"]);
  assert.deepEqual(out.map((p) => p.name), ["near", "Far", "Mid"]);
  assert.ok(out.every((p, i) => i === 0 || out[i - 1].distance <= p.distance));
  assert.ok(Math.abs(out[0].distance - 55.6) < 2, `distance ${out[0].distance}`);
});
test("uses way centres, skips unnamed and coordinate-less elements", () => {
  const out = parseCandidates(
    [
      { type: "way", id: 9, center: { lat: C.lat + 0.001, lon: C.lon }, tags: { name: "Hall" } },
      { type: "node", id: 10, lat: C.lat, lon: C.lon, tags: {} },
      { type: "node", id: 11, lat: C.lat, lon: C.lon, tags: { name: "   " } },
      { type: "relation", id: 12, tags: { name: "No coords" } },
    ],
    C,
  );
  assert.deepEqual(out.map((p) => p.id), ["way/9"]);
});
test("caps the pool", () => {
  const many = Array.from({ length: 100 }, (_, i) => el(i, `P${i}`, i * 0.0001));
  const out = parseCandidates(many, C);
  assert.equal(out.length, POOL_SIZE);
  assert.equal(out[0].name, "P0");
  assert.equal(parseCandidates(many, C, 5).length, 5);
});
test("keeps short hours, drops over-long ones", () => {
  const out = parseCandidates(
    [
      el(1, "A", 0.001, { opening_hours: " Mo-Fr 09:00-17:00 " }),
      el(2, "B", 0.002, { opening_hours: "x".repeat(401) }),
      el(3, "C", 0.003),
    ],
    C,
  );
  assert.equal(out[0].hours, "Mo-Fr 09:00-17:00");
  assert.ok(!("hours" in out[1]) && !("hours" in out[2]));
});

console.log("opening hours (uses the real opening_hours package)");
const OH = await loadOpeningHours();
const LONDON = { lat: 51.5, lon: -0.1 };
const at = (iso) => new Date(iso);
const state = (hours, tz, iso, pos = LONDON) => openStateOf(OH, { ...pos, hours }, tz, at(iso));

test("package loads as a constructor", () => assert.equal(typeof OH, "function"));
test("same instant, different zones: London open, Tokyo and New York closed", () => {
  // 2026-10-07 12:00 UTC = 13:00 London (BST) = 21:00 Tokyo = 08:00 New York
  const rule = "Mo-Su 09:00-17:00";
  assert.equal(state(rule, "Europe/London", "2026-10-07T12:00:00Z"), "open");
  assert.equal(state(rule, "Asia/Tokyo", "2026-10-07T12:00:00Z"), "closed");
  assert.equal(state(rule, "America/New_York", "2026-10-07T12:00:00Z"), "closed");
});
test("weekday rules use the place's weekday, not the machine's", () => {
  // 2026-10-07 is a Wednesday.
  const rule = "We 00:00-24:00";
  assert.equal(state(rule, "Europe/London", "2026-10-07T23:30:00Z"), "closed"); // already Thu 00:30 in London
  assert.equal(state(rule, "America/New_York", "2026-10-07T23:30:00Z"), "open"); // still Wed 19:30 in New York
  assert.equal(state(rule, "Asia/Tokyo", "2026-10-07T12:00:00Z"), "open"); // Wed 21:00 in Tokyo
});
test("typical weekly hours", () => {
  const rule = "Tu-Sa 12:00-22:00; Su,Mo 12:00-21:00";
  assert.equal(state(rule, "Europe/London", "2026-10-07T12:00:00Z"), "open"); // Wed 13:00
  assert.equal(state(rule, "Europe/London", "2026-10-07T22:30:00Z"), "closed"); // Wed 23:30
  assert.equal(state(rule, "Europe/London", "2026-10-07T08:00:00Z"), "closed"); // Wed 09:00
});
test("24/7 is open, off is closed", () => {
  assert.equal(state("24/7", "Europe/London", "2026-10-07T03:00:00Z"), "open");
  assert.equal(state("off", "Europe/London", "2026-10-07T12:00:00Z"), "closed");
});
test("missing, garbage and comment-only hours are unknown", () => {
  assert.equal(state(undefined, "Europe/London", "2026-10-07T12:00:00Z"), "unknown");
  assert.equal(state("", "Europe/London", "2026-10-07T12:00:00Z"), "unknown");
  assert.equal(state("definitely not opening hours", "Europe/London", "2026-10-07T12:00:00Z"), "unknown");
  assert.equal(state('"on appointment"', "Europe/London", "2026-10-07T12:00:00Z"), "unknown");
});
test("sunrise-sunset rules follow the place's location", () => {
  assert.equal(state("Mo-Su sunrise-sunset", "Europe/London", "2026-06-21T12:00:00Z"), "open");
  assert.equal(state("Mo-Su sunrise-sunset", "Europe/London", "2026-06-21T23:30:00Z"), "closed");
});
test("an unknown time zone falls back to the given clock instead of throwing", () => {
  const now = at("2026-10-07T12:00:00Z");
  assert.equal(placeLocalDate(now, "Not/AZone"), now);
  assert.equal(placeLocalDate(now, null), now);
});
await test("openStates maps every place and skips the parser when nothing has hours", async () => {
  const none = await openStates(
    [
      { id: "a", lat: 1, lon: 1 },
      { id: "b", lat: 1, lon: 1 },
    ],
    null,
  );
  assert.deepEqual(none, { a: "unknown", b: "unknown" });
  const some = await openStates(
    [
      { id: "a", lat: 51.5, lon: -0.1, hours: "24/7" },
      { id: "b", lat: 51.5, lon: -0.1, hours: "off" },
      { id: "c", lat: 51.5, lon: -0.1 },
    ],
    "Europe/London",
    at("2026-10-07T12:00:00Z"),
  );
  assert.deepEqual(some, { a: "open", b: "closed", c: "unknown" });
});

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
console.log(`\n${passed} passed (machine time zone: ${zone})${process.exitCode ? ", some FAILED" : ""}`);
