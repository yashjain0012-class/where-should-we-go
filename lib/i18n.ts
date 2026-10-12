/**
 * English and Hindi, with no library. The English text in the code IS the key: `t("Search")` returns "Search" in
 * English, and the Hindi from lib/hi.ts when Hindi is chosen (and the English again for anything not translated, so
 * a missing entry can never show a blank or a key). Placeholders like {n} are filled in after the lookup, in both
 * languages. scripts/test-i18n.mjs checks every t("...") in the code has a Hindi entry with the same placeholders.
 */
import { HI } from "./hi";

export type Lang = "en" | "hi";
export type Translate = (en: string, vars?: Record<string, string | number>) => string;

const KEY = "wsg-lang";
export const LANGS: Lang[] = ["en", "hi"];

/**
 * Marks English text that is kept (in state, a table or an error) and translated when it is shown, so the checker in
 * scripts/test-i18n.mjs knows it needs a Hindi entry. Returns the text unchanged.
 */
export const msg = (en: string): string => en;

/** Fills {name} placeholders. Unknown placeholders are left as they are. */
export function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

export function translate(lang: Lang, en: string, vars?: Record<string, string | number>): string {
  return interpolate(lang === "hi" ? (HI[en] ?? en) : en, vars);
}

/** The English "translator": what library functions use when they are not given one. */
export const english: Translate = (en, vars) => interpolate(en, vars);

export function translator(lang: Lang): Translate {
  return (en, vars) => translate(lang, en, vars);
}

/** "hi", "hi-IN" and so on give Hindi; everything else English. */
export function defaultLang(language: string | undefined): Lang {
  return /^hi(\b|[-_])/i.test(language ?? "") ? "hi" : "en";
}

// --- The remembered choice (a tiny external store, like lib/sound.ts) ----------------------

let lang: Lang | null = null;
const listeners = new Set<() => void>();

function apply(next: Lang) {
  document.documentElement.lang = next;
}

export function getLang(): Lang {
  if (lang === null) {
    try {
      const stored = window.localStorage.getItem(KEY);
      lang = stored === "en" || stored === "hi" ? stored : defaultLang(navigator.language);
    } catch {
      lang = defaultLang(navigator.language);
    }
    apply(lang);
  }
  return lang;
}

export function setLang(next: Lang): void {
  lang = next;
  try {
    window.localStorage.setItem(KEY, next);
  } catch {
    // not remembered across visits, which is fine
  }
  apply(next);
  listeners.forEach((l) => l());
}

export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
