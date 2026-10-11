/**
 * The last wheel you had, kept in this browser so it can be opened again with no connection.
 * It is stored as the same share link a friend would receive, so opening it is just following that link.
 */

const KEY = "wsg-last-wheel";

export function saveLastWheel(hash: string): void {
  try {
    window.localStorage.setItem(KEY, hash);
  } catch {
    // not remembered, which is fine
  }
}

/** The saved link hash ("#s=..." or "#c=..."), or null. The share-link decoders validate it when it is opened. */
export function loadLastWheel(): string | null {
  try {
    const hash = window.localStorage.getItem(KEY);
    return hash && /^#[sc]=[A-Za-z0-9_.-]{1,2100}$/.test(hash) ? hash : null;
  } catch {
    return null;
  }
}

export function forgetLastWheel(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // nothing stored anyway
  }
}
