import type { Translate } from "./i18n";

/**
 * Our own API routes answer in English, and some of those messages have a value inside them (a place, a distance).
 * This turns them back into a translatable template and fills the value in again. Anything it does not recognise is
 * handed to the translator as it is (which shows it unchanged if there is no translation).
 */
const PATTERNS: [RegExp, string][] = [
  // "Try again in a moment" is a fixed sentence of its own, so these must not capture it as a distance.
  [/^Searching (.+) took too long\. Try (?!again in a moment)(.+)\.$/, "Searching {a} took too long. Try {b}."],
  [/^The places service is busy right now\. Try (?!again in a moment)(.+)\.$/, "The places service is busy right now. Try {a}."],
  [/^Searching (.+) took too long\. Try again in a moment\.$/, "Searching {a} took too long. Try again in a moment."],
  [/^Couldn't find "(.*)"\. Try a nearby neighbourhood or city\.$/, "Couldn't find \"{a}\". Try a nearby neighbourhood or city."],
];

export function translateApi(message: string, t: Translate): string {
  for (const [pattern, template] of PATTERNS) {
    const m = pattern.exec(message);
    if (m) return t(template, { a: m[1], b: m[2] ?? "" });
  }
  return t(message);
}
