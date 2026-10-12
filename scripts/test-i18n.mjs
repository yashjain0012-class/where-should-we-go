// Run with: npm run test:i18n   (compiles lib/hi.ts and lib/i18n.ts with tsc, then runs these checks)
//
// Keeps the Hindi in step with the code: every English text marked with t("...") or msg("...") anywhere in the source must
// have a Hindi entry with the same {placeholders}, and every Hindi entry must still be used.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { HI } from "../.test-build/hi.js";
import { defaultLang, interpolate, translate, translator } from "../.test-build/i18n.js";

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

// --- find every marked English text in the source -----------------------------------------------------------------
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name.startsWith(".") ? [] : walk(path);
    return /\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name) ? [path] : [];
  });
}
const files = ["app", "components", "lib"].flatMap(walk).filter((f) => !/lib[\\/](hi|i18n)\.ts$/.test(f));

// A double-quoted JS string literal.
const STRING = String.raw`"((?:[^"\\\n]|\\.)*)"`;
const unescape = (s) => JSON.parse(`"${s.replace(/\\'/g, "'")}"`);
const CALL = new RegExp(String.raw`(?<![\w.])(?:t|msg)\(\s*${STRING}(\s*[,)])?`, "g");

/** key -> where it is used and whether the call passes values */
const used = new Map();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(CALL)) {
    const key = unescape(m[1]);
    const entry = used.get(key) ?? { files: new Set(), withVars: false, withoutVars: false };
    entry.files.add(file);
    if (m[2]?.trim() === ",") entry.withVars = true;
    else entry.withoutVars = true;
    used.set(key, entry);
  }
}
// The server's messages are matched against templates in lib/apiMessages.ts.
const api = readFileSync("lib/apiMessages.ts", "utf8");
for (const m of api.matchAll(new RegExp(String.raw`\],?\s*\n?\s*|,\s*${STRING}\]`, "g"))) {
  if (m[1]) used.set(unescape(m[1]), { files: new Set(["lib/apiMessages.ts"]), withVars: true, withoutVars: false });
}

const tokens = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const brands = new Set(["OpenStreetMap", "Apple Maps"]); // names that stay as they are

console.log(`checking ${used.size} marked texts against ${Object.keys(HI).length} Hindi entries`);

test("the scanner found the texts (so a silent scanner bug cannot make this pass)", () => {
  assert.ok(used.size > 150, `only ${used.size} found`);
  for (const key of ["Search", "Spin!", "Where should we go?", "Open in Google Maps", "Searching {a} took too long. Try {b}."]) assert.ok(used.has(key), key);
});
test("every text has a Hindi translation", () => {
  const missing = [...used.keys()].filter((k) => !(k in HI));
  assert.deepEqual(missing, [], `${missing.length} missing:\n   ${missing.join("\n   ")}`);
});
test("every Hindi entry is still used by the code", () => {
  const extra = Object.keys(HI).filter((k) => !used.has(k));
  assert.deepEqual(extra, [], `${extra.length} unused:\n   ${extra.join("\n   ")}`);
});
test("each translation keeps exactly the same {placeholders}", () => {
  const bad = Object.entries(HI).filter(([k, v]) => tokens(k) !== tokens(v)).map(([k, v]) => `${k}  =>  ${v}`);
  assert.deepEqual(bad, []);
});
test("a text with {placeholders} is always given values, and one without never is", () => {
  const bad = [];
  for (const [key, u] of used) {
    if (key.includes("{") && /\{\w+\}/.test(key) && !u.withVars && ![...u.files].some((f) => f.endsWith("apiMessages.ts"))) bad.push(`${key} (${[...u.files].join(", ")})`);
  }
  assert.deepEqual(bad, [], "placeholders that are never filled in");
});
test("translations are real Hindi (Devanagari), not blank or a copy of the English", () => {
  const bad = Object.entries(HI)
    .filter(([k, v]) => !brands.has(k) && (!v.trim() || !/[ऀ-ॿ]/.test(v)))
    .map(([k, v]) => `${k}  =>  ${v}`);
  assert.deepEqual(bad, []);
});
test("no translation has stray spaces, tabs or doubled spaces", () => {
  const bad = Object.entries(HI).filter(([, v]) => v !== v.trim() || /\s{2,}/.test(v.replace(/\n/g, " "))).map(([k]) => k);
  assert.deepEqual(bad, []);
});

console.log("the translator itself");
test("English returns the text, with placeholders filled", () => {
  assert.equal(translate("en", "Search"), "Search");
  assert.equal(translate("en", "{n} min walk", { n: 5 }), "5 min walk");
  assert.equal(translator("en")("{h} h {m} min walk", { h: 1, m: 3 }), "1 h 3 min walk");
});
test("Hindi returns the translation, with placeholders filled", () => {
  assert.equal(translate("hi", "Search"), HI["Search"]);
  assert.ok(translate("hi", "{n} min walk", { n: 5 }).includes("5"));
  assert.ok(!translate("hi", "{n} min walk", { n: 5 }).includes("{n}"));
});
test("an untranslated text falls back to the English, never blank", () => {
  assert.equal(translate("hi", "A sentence nobody translated"), "A sentence nobody translated");
  assert.equal(translate("hi", "Made up {n}", { n: 3 }), "Made up 3");
});
test("unknown placeholders are left alone, and values are not re-interpreted", () => {
  assert.equal(interpolate("Hello {name} {other}", { name: "x" }), "Hello x {other}");
  assert.equal(interpolate("{a}", { a: "{b}" }), "{b}");
  assert.equal(interpolate("$& {a}", { a: "$&" }), "$& $&");
});
test("the default language follows the device", () => {
  for (const l of ["hi", "hi-IN", "hi_IN", "HI"]) assert.equal(defaultLang(l), "hi", l);
  for (const l of ["en-IN", "en-US", "fr", "hindi", "his", "", undefined]) assert.equal(defaultLang(l), "en", String(l));
});

console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
