// Run with: npm run test:share   (compiles lib/share.ts with tsc, then runs these checks)
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { encodeShare, decodeShare, MAX_HASH_CHARS } from "../.test-build/share.js";

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    console.error(`  FAIL ${name}\n       ${err.message}`);
    process.exitCode = 1;
  }
}

const CENTRE = { lat: 51.5246, lon: -0.078 };
const LABEL = "Shoreditch, London Borough of Hackney, Greater London, England, EC2A 3AR, United Kingdom";

function makePlaces(count, nameFor) {
  return Array.from({ length: count }, (_, i) => ({
    id: `node/${1000 + i}`,
    name: nameFor(i),
    lat: CENTRE.lat + (i - count / 2) * 0.0009,
    lon: CENTRE.lon + ((i * 7) % 5 - 2) * 0.001,
  }));
}
const state = (places, category = "bars", label = LABEL) => ({ center: CENTRE, label, category, places });

// Same FNV-1a as lib/share.ts, so we can build links that pass the checksum but fail validation.
function fnv(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
const b64 = (obj) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
const craft = (arr) => {
  const payload = b64(arr);
  return `#s=1.${fnv(payload)}.${payload}`;
};
const clat = Math.round(CENTRE.lat * 1e5);
const clon = Math.round(CENTRE.lon * 1e5);
const validRows = [["Place A", 10, 20], ["Place B", -30, 40]];

console.log("round trips");
const NAMES = ["Hoxton Grill", "Café de Flore", "Le Concert de Cuisine", "寿司 さいとう", "🍣 Sushi & Co.", "The Old Street Chinese Restaurant", "Maki", "Búsaba Eathai"];
for (let n = 1; n <= 8; n++) {
  test(`${n} place(s)`, () => {
    const places = makePlaces(n, (i) => NAMES[i]);
    const decoded = decodeShare(encodeShare(state(places)));
    assert.ok(decoded, "decoded");
    assert.equal(decoded.category, "bars");
    assert.equal(decoded.places.length, n);
    assert.ok(Math.abs(decoded.center.lat - CENTRE.lat) < 6e-4, "centre is snapped, not exact");
    assert.equal(decoded.label, "Shoreditch, London Borough of Hackney, Greater London");
    decoded.places.forEach((p, i) => {
      assert.equal(p.name, NAMES[i]);
      assert.ok(Math.abs(p.lat - places[i].lat) <= 1e-5, "lat");
      assert.ok(Math.abs(p.lon - places[i].lon) <= 1e-5, "lon");
      assert.equal(p.id, `shared-${i}`);
    });
  });
}
test("every category survives", () => {
  for (const c of ["restaurants", "cafes", "bars", "things"]) {
    assert.equal(decodeShare(encodeShare(state(makePlaces(3, (i) => `P${i}`), c))).category, c);
  }
});
test("tolerates trailing punctuation added by chat apps", () => {
  const link = encodeShare(state(makePlaces(4, (i) => NAMES[i])));
  for (const tail of [")", ".", ",", ">", "!", ".)"]) assert.ok(decodeShare(link + tail), `tail ${tail}`);
});

console.log("privacy");
function metres(a, b) {
  return Math.hypot((a.lat - b.lat) * 111320, (a.lon - b.lon) * 111320 * Math.cos((a.lat * Math.PI) / 180));
}
test("a precise GPS centre is never exposed in the link", () => {
  const gps = { lat: 51.123456, lon: -0.987654 };
  const places = [{ id: "a", name: "Cafe", lat: gps.lat + 0.002, lon: gps.lon - 0.001 }];
  const link = encodeShare({ center: gps, label: "Your location", category: "cafes", places });
  const decoded = decodeShare(link);
  assert.ok(decoded);
  assert.notEqual(decoded.center.lat, gps.lat);
  assert.notEqual(decoded.center.lon, gps.lon);
  assert.ok(metres(decoded.center, gps) < 90, "snapped centre stays close to the real area");
  // the exact digits must not appear anywhere in the decoded payload
  assert.ok(!link.includes("51123456") && !link.includes("98765"));
  assert.ok(Math.abs(decoded.places[0].lat - places[0].lat) <= 1e-5, "places keep full precision");
});

console.log("length budget");
const typical = encodeShare(state(makePlaces(8, (i) => ["Hoxton Grill", "Bone Daddies", "Delamina East", "Kennedy's", "Burger & Beyond", "Indi Go @ RichMix", "Hopper's", "Maki"][i])));
console.log(`       typical 8 places: ${typical.length} characters`);
test("typical 8-place link is well under budget", () => assert.ok(typical.length < 900, `${typical.length}`));
const worstCases = {
  "8 x 60-char ASCII names": makePlaces(8, (i) => `${i}`.padEnd(60, "x")),
  "8 x 80-char ASCII names": makePlaces(8, (i) => `${i}`.padEnd(80, "y")),
  "8 x 60-char CJK names": makePlaces(8, () => "寿".repeat(60)),
  "8 x 80-char emoji names": makePlaces(8, () => "🍣".repeat(40)),
};
for (const [name, places] of Object.entries(worstCases)) {
  const link = encodeShare(state(places, "things", "寿".repeat(200)));
  console.log(`       ${name}: ${link.length} characters`);
  test(`worst case stays within ${MAX_HASH_CHARS}: ${name}`, () => {
    assert.ok(link.length <= MAX_HASH_CHARS, `${link.length}`);
    const decoded = decodeShare(link);
    assert.ok(decoded, "still decodes");
    assert.equal(decoded.places.length, 8);
  });
}

console.log("broken and tampered links all fall back (null, never a throw)");
const good = encodeShare(state(makePlaces(5, (i) => NAMES[i])));
const flip = (s, at) => s.slice(0, at) + (s[at] === "A" ? "B" : "A") + s.slice(at + 1);
const cases = {
  "empty string": "",
  "no prefix": good.slice(3),
  "prefix only": "#s=",
  "truncated": good.slice(0, -6),
  "truncated to half": good.slice(0, Math.floor(good.length / 2)),
  "flipped character in payload": flip(good, good.length - 20),
  "flipped character in checksum": flip(good, 6),
  "bad base64": "#s=1.abc.!!!!",
  "not json": `#s=1.${fnv(Buffer.from("hello").toString("base64url"))}.${Buffer.from("hello").toString("base64url")}`,
  "wrong version": good.replace("#s=1.", "#s=2."),
  "missing parts": "#s=1.onlyone",
  "garbage": "#s=%%%%.....////",
  "wrong length array": craft([clat, clon, 0, "x"]),
  "not an array": craft({ a: 1 }),
  "no places": craft([clat, clon, 0, "x", []]),
  "9 places": craft([clat, clon, 0, "x", Array.from({ length: 9 }, (_, i) => [`P${i}`, i, i])]),
  "unknown category": craft([clat, clon, 99, "x", validRows]),
  "negative category": craft([clat, clon, -1, "x", validRows]),
  "non-integer coordinate": craft([clat, clon, 0, "x", [["A", 1.5, 2]]]),
  "string coordinate": craft([clat, clon, 0, "x", [["A", "1", 2]]]),
  "centre latitude out of range": craft([95 * 1e5, clon, 0, "x", [["A", 0, 0]]]),
  "centre longitude out of range": craft([clat, 181 * 1e5, 0, "x", [["A", 0, 0]]]),
  "place 2 km away": craft([clat, clon, 0, "x", [["A", 2000 * 0.9, 0]]]),
  "81-char name": craft([clat, clon, 0, "x", [["n".repeat(81), 0, 0]]]),
  "name is a number": craft([clat, clon, 0, "x", [[42, 0, 0]]]),
  "empty name": craft([clat, clon, 0, "x", [["   ", 0, 0]]]),
  "control-characters-only name": craft([clat, clon, 0, "x", [["\u0000\u0007", 0, 0]]]),
  "label too long": craft([clat, clon, 0, "x".repeat(121), validRows]),
  "label not a string": craft([clat, clon, 0, 5, validRows]),
  "row has extra field": craft([clat, clon, 0, "x", [["A", 0, 0, "https://evil.example"]]]),
};
for (const [name, link] of Object.entries(cases)) {
  test(name, () => assert.equal(decodeShare(link), null));
}

console.log("hostile text decodes as inert text only");
test("HTML and javascript: in names stay plain strings; links are rebuilt, not read", () => {
  const evil = ["<img src=x onerror=alert(1)>", "javascript:alert(1)", "<script>alert(1)</script>", 'a" onmouseover="x'];
  const decoded = decodeShare(craft([clat, clon, 0, "<b>label</b>", evil.map((n, i) => [n, i, i])]));
  assert.ok(decoded);
  decoded.places.forEach((p, i) => assert.equal(p.name, evil[i]));
  assert.equal(decoded.label, "<b>label</b>");
  assert.ok(!("url" in decoded.places[0]) && !("href" in decoded.places[0]));
});
test("control and bidi-override characters are stripped", () => {
  const decoded = decodeShare(craft([clat, clon, 0, "x", [["Caf‮é\u0000 Bar ", 0, 0]]]));
  assert.equal(decoded.places[0].name, "Caf é Bar");
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
