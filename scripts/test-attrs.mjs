// Run with: npm run test:attrs   (compiles lib/overpass.ts and lib/filters.ts with tsc, then runs these checks)
import assert from "node:assert/strict";
import { parseAttrs, parseCandidates } from "../.test-build/overpass.js";
import {
  NO_FILTERS, activeFilterCount, matchOf, selectWheel, cuisineOptions, describeAttrs, prettyCuisine, OUTDOOR_KINDS,
} from "../.test-build/filters.js";

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
const F = (over = {}) => ({ ...NO_FILTERS, ...over });

console.log("reading OpenStreetMap tags");
test("a fully tagged place is normalised", () => {
  const a = parseAttrs({
    amenity: "restaurant", cuisine: "Italian; Pizza ;italian", "diet:vegetarian": "YES", "diet:vegan": "only",
    takeaway: "no", outdoor_seating: "yes", wheelchair: "limited",
  });
  assert.deepEqual(a, {
    kind: "restaurant", cuisine: ["italian", "pizza"], vegetarian: "yes", vegan: "only", takeaway: "no",
    outdoorSeating: true, wheelchair: "limited",
  });
});
test("unknown or junk values are left out, never guessed", () => {
  assert.equal(parseAttrs({ "diet:vegetarian": "maybe", wheelchair: "?", outdoor_seating: "sometimes", cuisine: ";; ;" }), undefined);
  assert.equal(parseAttrs(undefined), undefined);
  assert.equal(parseAttrs({}), undefined);
});
test("cuisines: at most 3, over-long ones dropped; kind falls back to leisure or tourism", () => {
  assert.deepEqual(parseAttrs({ amenity: "cafe", cuisine: "a;b;c;d;e" }).cuisine, ["a", "b", "c"]);
  assert.deepEqual(parseAttrs({ amenity: "cafe", cuisine: `${"x".repeat(25)};coffee_shop` }).cuisine, ["coffee_shop"]);
  assert.equal(parseAttrs({ leisure: "park" }).kind, "park");
  assert.equal(parseAttrs({ tourism: "museum" }).kind, "museum");
});
test("parseCandidates attaches attrs only when there are some", () => {
  const out = parseCandidates(
    [
      { type: "node", id: 1, lat: 51.5, lon: -0.1, tags: { name: "A", amenity: "cafe", cuisine: "coffee_shop" } },
      { type: "node", id: 2, lat: 51.5002, lon: -0.1, tags: { name: "B" } },
    ],
    { lat: 51.5, lon: -0.1 },
  );
  assert.deepEqual(out[0].attrs, { kind: "cafe", cuisine: ["coffee_shop"] });
  assert.ok(!("attrs" in out[1]));
});

console.log("matching (match, unknown, mismatch)");
const p = (attrs) => ({ attrs });
test("vegetarian: yes, only and vegan places match; 'no' is a mismatch; untagged is unknown", () => {
  const f = F({ diet: "vegetarian" });
  assert.equal(matchOf(p({ vegetarian: "yes" }), f), "match");
  assert.equal(matchOf(p({ vegetarian: "only" }), f), "match");
  assert.equal(matchOf(p({ vegan: "yes" }), f), "match");
  assert.equal(matchOf(p({ vegetarian: "no" }), f), "mismatch");
  assert.equal(matchOf(p({}), f), "unknown");
  assert.equal(matchOf({}, f), "unknown");
});
test("vegan needs a vegan tag; a vegetarian tag alone is not enough", () => {
  const f = F({ diet: "vegan" });
  assert.equal(matchOf(p({ vegan: "only" }), f), "match");
  assert.equal(matchOf(p({ vegan: "no" }), f), "mismatch");
  assert.equal(matchOf(p({ vegetarian: "yes" }), f), "unknown");
});
test("cuisine: any selected cuisine matches; a different tagged cuisine is a mismatch", () => {
  const f = F({ cuisines: ["italian", "indian"] });
  assert.equal(matchOf(p({ cuisine: ["pizza", "italian"] }), f), "match");
  assert.equal(matchOf(p({ cuisine: ["japanese"] }), f), "mismatch");
  assert.equal(matchOf(p({ kind: "restaurant" }), f), "unknown");
});
test("outdoor seating, wheelchair access and takeaway", () => {
  assert.equal(matchOf(p({ outdoorSeating: true }), F({ outdoor: true })), "match");
  assert.equal(matchOf(p({ outdoorSeating: false }), F({ outdoor: true })), "mismatch");
  assert.equal(matchOf(p({}), F({ outdoor: true })), "unknown");
  assert.equal(matchOf(p({ wheelchair: "yes" }), F({ wheelchair: true })), "match");
  assert.equal(matchOf(p({ wheelchair: "limited" }), F({ wheelchair: true })), "mismatch");
  assert.equal(matchOf(p({ takeaway: "only" }), F({ takeaway: true })), "match");
  assert.equal(matchOf(p({ takeaway: "no" }), F({ takeaway: true })), "mismatch");
});
test("several filters: a single mismatch rules a place out, otherwise any unknown makes it unknown", () => {
  const f = F({ cuisines: ["italian"], outdoor: true });
  assert.equal(matchOf(p({ cuisine: ["italian"], outdoorSeating: true }), f), "match");
  assert.equal(matchOf(p({ cuisine: ["italian"] }), f), "unknown");
  assert.equal(matchOf(p({ cuisine: ["italian"], outdoorSeating: false }), f), "mismatch");
  assert.equal(matchOf(p({ cuisine: ["thai"] }), f), "mismatch");
});
test("no filters: everything matches; the filter count counts groups", () => {
  assert.equal(matchOf(p({ vegetarian: "no" }), NO_FILTERS), "match");
  assert.equal(activeFilterCount(NO_FILTERS), 0);
  assert.equal(activeFilterCount(F({ diet: "vegan", cuisines: ["a", "b"], takeaway: true })), 3);
});

console.log("choosing the wheel");
const names = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
const pool = names.map((name, i) => ({ id: name, name, distance: 40 + i * 80, attrs: {} }));
pool[0].attrs = { vegetarian: "yes" };
pool[1].attrs = { vegetarian: "no" };
pool[2].attrs = { vegan: "only" };
pool[3].attrs = { vegetarian: "yes", kind: "park" };
pool[5].attrs = { vegetarian: "no" };
const ids = (xs) => xs.map((x) => x.id).join("");
const opts = (over = {}) => ({ openNow: false, states: {}, filters: NO_FILTERS, preferIndoor: false, ...over });

test("no filters: just the nearest 8, in order", () => {
  assert.equal(ids(selectWheel(pool, opts())), "ABCDEFGH");
});
test("vegetarian: confirmed matches first, then untagged nearest-first, mismatches dropped, 8 at most", () => {
  assert.equal(ids(selectWheel(pool, opts({ filters: F({ diet: "vegetarian" }) }))), "ACD" + "EGHIJ");
});
test("open now drops closed places and still applies the filters", () => {
  const states = { A: "closed", E: "closed" };
  assert.equal(ids(selectWheel(pool, opts({ openNow: true, states, filters: F({ diet: "vegetarian" }) }))), "CD" + "GHIJKL");
});
test("when it rains, outdoor kinds go after indoor ones of the same match level", () => {
  assert.equal(ids(selectWheel(pool, opts({ preferIndoor: true }))), "ABCEFGHI"); // D (a park) slips after the indoor places
  assert.ok(OUTDOOR_KINDS.has("park") && !OUTDOOR_KINDS.has("museum"));
  // with a filter, a confirmed outdoor match still beats an untagged indoor place
  assert.equal(ids(selectWheel(pool, opts({ preferIndoor: true, filters: F({ diet: "vegetarian" }) }), 3)), "ACD");
});
test("the limit is respected", () => {
  assert.equal(selectWheel(pool, opts(), 3).length, 3);
});
test("excluded places (hidden, or won recently) are skipped and the next-nearest fill in", () => {
  assert.equal(ids(selectWheel(pool, opts({ exclude: new Set(["B", "D"]) }))), "ACEFGHIJ");
});
test("favourites get onto the wheel ahead of nearer places", () => {
  assert.equal(ids(selectWheel(pool, opts({ favourites: new Set(["K", "J"]) }))), "JKABCDEF");
  // a favourite that fails a filter is still out, and one that matches is first among the matches
  assert.equal(ids(selectWheel(pool, opts({ filters: F({ diet: "vegetarian" }), favourites: new Set(["B", "C"]) }))), "CADEGHIJ");
});
test("an untagged favourite does not jump ahead of confirmed matches", () => {
  assert.equal(ids(selectWheel(pool, opts({ filters: F({ diet: "vegetarian" }), favourites: new Set(["K"]) }), 4)), "ACDK");
});

console.log("chips and descriptions");
test("cuisine options: most common first, ties alphabetical, capped", () => {
  const places = [
    { attrs: { cuisine: ["italian", "pizza"] } }, { attrs: { cuisine: ["italian"] } }, { attrs: { cuisine: ["indian"] } },
    { attrs: { cuisine: ["burger"] } }, { attrs: {} }, {},
  ];
  assert.deepEqual(cuisineOptions(places), [
    { name: "italian", count: 2 }, { name: "burger", count: 1 }, { name: "indian", count: 1 }, { name: "pizza", count: 1 },
  ]);
  assert.equal(cuisineOptions(places, 2).length, 2);
});
test("describing a place", () => {
  assert.equal(prettyCuisine("coffee_shop"), "Coffee shop");
  assert.deepEqual(describeAttrs(undefined), []);
  assert.deepEqual(
    describeAttrs({ cuisine: ["italian", "pizza"], vegetarian: "yes", outdoorSeating: true, wheelchair: "yes", takeaway: "yes" }),
    ["Italian, Pizza", "Vegetarian options", "Outdoor seating", "Wheelchair accessible", "Takeaway"],
  );
  assert.deepEqual(describeAttrs({ vegan: "only", vegetarian: "yes" }), ["Vegan only"]); // vegan implies vegetarian: one label
  assert.deepEqual(describeAttrs({ vegan: "yes", vegetarian: "yes" }), ["Vegan options"]);
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
