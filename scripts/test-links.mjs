// Run with: npm run test:links   (compiles lib/walk.ts, directions.ts and calendar.ts, then runs these checks)
import assert from "node:assert/strict";
import { walkMinutes, formatWalk } from "../.test-build/walk.js";
import { googleDirections, appleDirections, osmPlace } from "../.test-build/directions.js";
import { buildIcs, escapeText, foldLine, icsFileName } from "../.test-build/calendar.js";

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

console.log("walking time");
test("minutes at 80 m per minute, never below 1", () => {
  assert.equal(walkMinutes(0), 1);
  assert.equal(walkMinutes(30), 1);
  assert.equal(walkMinutes(80), 1);
  assert.equal(walkMinutes(120), 2); // 1.5 rounds up
  assert.equal(walkMinutes(1000), 13);
  assert.equal(walkMinutes(5000), 63);
});
test("formatting", () => {
  assert.equal(formatWalk(400), "5 min walk");
  assert.equal(formatWalk(4800), "1 h walk");
  assert.equal(formatWalk(5000), "1 h 3 min walk");
});

console.log("directions links");
const place = { name: "Café Müller & Sons", lat: 51.5266, lon: -0.0799 };
test("Google, Apple and OpenStreetMap URLs", () => {
  assert.equal(googleDirections(place), "https://www.google.com/maps/dir/?api=1&destination=51.526600,-0.079900&travelmode=walking");
  assert.equal(appleDirections(place), "https://maps.apple.com/?daddr=51.526600,-0.079900&dirflg=w&q=Caf%C3%A9%20M%C3%BCller%20%26%20Sons");
  assert.equal(osmPlace(place), "https://www.openstreetmap.org/?mlat=51.526600&mlon=-0.079900#map=18/51.526600/-0.079900");
});
test("a name can never break out of the query string", () => {
  const url = appleDirections({ name: "a&dirflg=x#y=1", lat: 1, lon: 2 });
  assert.equal(new URL(url).searchParams.get("q"), "a&dirflg=x#y=1");
  assert.equal(new URL(url).searchParams.get("dirflg"), "w");
});

console.log("calendar file (.ics)");
const start = new Date(2026, 9, 7, 19, 0, 0); // 7 Oct 2026, 19:00 local
const stamp = new Date(Date.UTC(2026, 9, 6, 12, 0, 0));
const unfold = (text) => text.replace(/\r\n /g, "");
test("a complete, well-formed event", () => {
  const ics = buildIcs({ title: "Dinner at Hoxton Grill", start, durationMinutes: 90, location: "Hoxton Grill", description: "Picked by the wheel", lat: 51.5266, lon: -0.0799, url: "https://example.com/x", uid: "abc@test", stamp });
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n"));
  for (const line of ["UID:abc@test", "DTSTAMP:20261006T120000Z", "DTSTART:20261007T190000", "DTEND:20261007T203000", "SUMMARY:Dinner at Hoxton Grill", "LOCATION:Hoxton Grill", "GEO:51.526600;-0.079900"]) {
    assert.ok(ics.split("\r\n").includes(line), `missing ${line}`);
  }
  assert.ok(!/(^|[^\r])\n/.test(ics), "every line break is CRLF");
});
test("an event crossing midnight ends on the next day", () => {
  const ics = buildIcs({ title: "Late", start: new Date(2026, 9, 7, 23, 0, 0), durationMinutes: 120, uid: "u", stamp });
  assert.ok(ics.includes("DTEND:20261008T010000"));
});
test("text is escaped so a name cannot add fields", () => {
  assert.equal(escapeText("A, B; C\\D\nE"), "A\\, B\\; C\\\\D\\nE");
  const ics = buildIcs({ title: "Bar, Grill; Co\r\nEND:VEVENT", start, durationMinutes: 60, uid: "u", stamp });
  assert.equal(ics.split("\r\n").filter((l) => l.startsWith("END:VEVENT")).length, 1, "the injected END:VEVENT stays inside SUMMARY");
  assert.ok(unfold(ics).includes("SUMMARY:Bar\\, Grill\\; Co\\nEND:VEVENT"));
});
test("long lines are folded at 75 bytes and unfold back to the original", () => {
  const title = "The Very Long Name of a Restaurant That Goes On and On and On For Quite a While Indeed";
  const ics = buildIcs({ title, start, durationMinutes: 60, uid: "u", stamp });
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, `too long: ${line.length}`);
  assert.ok(unfold(ics).includes(`SUMMARY:${title}`));
});
test("folding never splits a multi-byte character", () => {
  const title = "寿司さいとう🍣".repeat(12);
  const folded = foldLine(`SUMMARY:${title}`);
  for (const line of folded.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), `SUMMARY:${title}`);
  assert.ok(!folded.includes("�"));
});
test("file names are safe", () => {
  assert.equal(icsFileName("Café Müller & Sons!"), "where-should-we-go-cafe-muller-sons.ics");
  assert.equal(icsFileName("../../etc/passwd"), "where-should-we-go-etc-passwd.ics");
  assert.equal(icsFileName("🍣🍣"), "where-should-we-go-plan.ics");
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
