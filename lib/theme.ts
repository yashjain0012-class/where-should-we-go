/**
 * Colour theme: follow the device (default), or force light or dark. The choice is remembered, and applied as
 * `data-theme="light" | "dark"` on <html>; app/dark-theme.css does the rest. A tiny script in the page head
 * (THEME_INIT_SCRIPT) sets the attribute before the first paint, so there is no flash of the wrong theme.
 */

export type ThemePref = "system" | "light" | "dark";

const KEY = "wsg-theme";
export const THEME_ORDER: ThemePref[] = ["system", "light", "dark"];

/** Runs in <head> before the page paints. Keep it tiny and in step with resolveTheme below. */
export const THEME_INIT_SCRIPT = `(function(){try{var p=localStorage.getItem("${KEY}");var d=p==="dark"||(p!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.dataset.theme=d?"dark":"light"}catch(e){}})()`;

let pref: ThemePref | null = null;
const listeners = new Set<() => void>();

export function getThemePref(): ThemePref {
  if (pref === null) {
    try {
      const stored = window.localStorage.getItem(KEY);
      pref = stored === "light" || stored === "dark" ? stored : "system";
    } catch {
      pref = "system";
    }
  }
  return pref;
}

export function resolveTheme(p: ThemePref, prefersDark: boolean): "light" | "dark" {
  return p === "dark" || (p === "system" && prefersDark) ? "dark" : "light";
}

function apply() {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = resolveTheme(getThemePref(), dark);
}

export function setThemePref(next: ThemePref): void {
  pref = next;
  try {
    if (next === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, next);
  } catch {
    // not remembered across visits, which is fine
  }
  apply();
  listeners.forEach((l) => l());
}

export function nextThemePref(current: ThemePref): ThemePref {
  return THEME_ORDER[(THEME_ORDER.indexOf(current) + 1) % THEME_ORDER.length];
}

/** Also re-applies when the device's own light/dark setting changes while we are following it. */
export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener);
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const onChange = () => {
    if (getThemePref() === "system") apply();
  };
  media.addEventListener("change", onChange);
  return () => {
    listeners.delete(listener);
    media.removeEventListener("change", onChange);
  };
}
