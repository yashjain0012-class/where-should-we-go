/**
 * Timing for the ticking sound. The wheel spins with a CSS cubic-bezier. Use the same
 * curve here, and every moment a slice boundary passes the pointer can be computed ahead
 * of time and scheduled on the audio clock. The ticks then slow down exactly as the
 * wheel does.
 */

/** The spin's easing curve. Wheel.tsx builds its CSS timing function from this. */
export const SPIN_BEZIER = [0.12, 0.6, 0.1, 1] as const;

export function cssSpinEasing(): string {
  return `cubic-bezier(${SPIN_BEZIER.join(", ")})`;
}

/**
 * Same maths as CSS `cubic-bezier(x1, y1, x2, y2)`: given the fraction of time elapsed
 * (0..1) return the fraction of the movement completed (0..1).
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
  const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
  const slopeX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;

  return (t: number) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    // Find the curve parameter s where x(s) = t: Newton's method, then bisection as a fallback.
    let s = t;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(s) - t;
      if (Math.abs(err) < 1e-7) return sampleY(s);
      const slope = slopeX(s);
      if (Math.abs(slope) < 1e-6) break;
      s -= err / slope;
    }
    let lo = 0;
    let hi = 1;
    s = t;
    for (let i = 0; i < 60; i++) {
      const x = sampleX(s);
      if (Math.abs(x - t) < 1e-7) break;
      if (x < t) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
    return sampleY(s);
  };
}

const spinEase = cubicBezier(...SPIN_BEZIER);

/** Wheel rotation (degrees) `elapsedMs` into a spin from `start` to `end` lasting `durationMs`. */
export function spinRotation(start: number, end: number, elapsedMs: number, durationMs: number): number {
  return start + (end - start) * spinEase(elapsedMs / durationMs);
}

/**
 * Seconds after the spin starts at which each slice boundary passes the (fixed) pointer.
 * The wheel turns clockwise from `startRotation` to `endRotation`. `slices` is either the
 * angle of equal slices, or the slice edges of an uneven wheel (degrees clockwise from the
 * top, as lib/spin.ts `sliceEdges` gives them). Ticks closer together than `minGapMs` are
 * dropped, because at the very fast start they would blur into one buzz.
 */
export function tickTimes(
  startRotation: number,
  endRotation: number,
  slices: number | readonly number[],
  durationMs: number,
  minGapMs = 25,
): number[] {
  const total = endRotation - startRotation;
  if (!(total > 0) || !(durationMs > 0) || (typeof slices === "number" && !(slices > 0))) return [];

  // The rotations in (start, end] at which a slice edge is under the pointer.
  const crossings: number[] = [];
  if (typeof slices === "number") {
    const first = Math.floor(startRotation / slices) + 1;
    const last = Math.floor(endRotation / slices);
    for (let k = first; k <= last; k++) crossings.push(k * slices);
  } else {
    // An edge at angle e (clockwise from the top) is under the pointer when the rotation is -e, modulo a turn.
    const edges = slices.slice(0, -1); // the final edge, 360, is the same as the first
    for (let turn = Math.floor(startRotation / 360); turn <= Math.floor(endRotation / 360) + 1; turn++) {
      for (const e of edges) {
        const at = 360 * turn - e;
        if (at > startRotation && at <= endRotation) crossings.push(at);
      }
    }
    crossings.sort((a, b) => a - b);
  }

  const times: number[] = [];
  for (const crossing of crossings) {
    const progress = (crossing - startRotation) / total; // fraction of the movement
    // Invert the easing: which moment has this progress? (The curve only ever increases.)
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (spinEase(mid) < progress) lo = mid;
      else hi = mid;
    }
    times.push(((lo + hi) / 2) * (durationMs / 1000));
  }

  const kept: number[] = [];
  for (const t of times) {
    if (kept.length === 0 || (t - kept[kept.length - 1]) * 1000 >= minGapMs) kept.push(t);
  }
  return kept;
}
