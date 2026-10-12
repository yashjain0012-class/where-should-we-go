"use client";

import { useSyncExternalStore } from "react";
import { getThemePref, nextThemePref, setThemePref, subscribeTheme, type ThemePref } from "@/lib/theme";
import { msg } from "@/lib/i18n";
import { useT } from "@/lib/useT";

const LABELS: Record<ThemePref, { icon: string; text: string }> = {
  system: { icon: "🌓", text: msg("Auto") },
  light: { icon: "☀️", text: msg("Light") },
  dark: { icon: "🌙", text: msg("Dark") },
};

/** Cycles Auto (follow the device), Light, Dark. */
export default function ThemeToggle() {
  const t = useT();
  const pref = useSyncExternalStore(subscribeTheme, getThemePref, () => "system" as ThemePref);
  const next = nextThemePref(pref);
  return (
    <button
      type="button"
      onClick={() => setThemePref(next)}
      aria-label={t("Colour theme: {current}. Switch to {next}", { current: t(LABELS[pref].text), next: t(LABELS[next].text) })}
      className="flex min-h-11 items-center gap-1.5 rounded-full bg-white/70 px-3 text-sm font-semibold text-indigo-900 shadow-sm ring-1 ring-indigo-100 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
    >
      <span aria-hidden>{LABELS[pref].icon}</span>
      <span>{t(LABELS[pref].text)}</span>
    </button>
  );
}
