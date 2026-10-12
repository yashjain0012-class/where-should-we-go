"use client";

import { setLang, type Lang } from "@/lib/i18n";
import { useLang } from "@/lib/useT";

/** English / हिन्दी. Each language is written in itself, so it can be found even if the page is in the wrong one. */
export default function LangToggle() {
  const lang = useLang();
  const next: Lang = lang === "en" ? "hi" : "en";
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      lang={next}
      aria-label={lang === "en" ? "हिन्दी में देखें (Switch to Hindi)" : "Switch to English (अंग्रेज़ी में देखें)"}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/70 px-3 text-sm font-semibold text-indigo-900 shadow-sm ring-1 ring-indigo-100 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
    >
      {next === "hi" ? "हिन्दी" : "English"}
    </button>
  );
}
