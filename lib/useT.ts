"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getLang, subscribeLang, translator, type Lang, type Translate } from "./i18n";

/** The current language ("en" for the server render and first paint, then the real choice). */
export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, () => "en" as Lang);
}

/** `const t = useT(); t("Search")`. Re-renders when the language changes. */
export function useT(): Translate {
  const lang = useLang();
  return useMemo(() => translator(lang), [lang]);
}
