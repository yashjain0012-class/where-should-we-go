import type confettiFn from "canvas-confetti";

type Confetti = typeof confettiFn;

let library: Confetti | null = null;

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Two quick bursts of confetti from `origin` (0..1 of the viewport). Skipped entirely for
 * people who asked their device for reduced motion. The library is loaded on first use.
 */
export async function fireConfetti(
  origin: { x: number; y: number },
  colors: string[],
): Promise<void> {
  if (prefersReducedMotion()) return;
  library ??= (await import("canvas-confetti")).default;
  const confetti = library;
  const base = {
    origin,
    colors,
    zIndex: 100,
    disableForReducedMotion: true, // the library's own guard, as a second layer
  };
  void confetti({ ...base, particleCount: 90, spread: 70, startVelocity: 45 });
  setTimeout(() => {
    void confetti({ ...base, particleCount: 60, spread: 110, startVelocity: 30, scalar: 0.9 });
  }, 180);
}

/** Remove any confetti still on screen (spin interrupted, or the page is being left). */
export function stopConfetti(): void {
  library?.reset();
}
