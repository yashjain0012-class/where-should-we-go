/**
 * Phone extras: a small vibration as the wheel slows down, and "shake to spin".
 * Both are one switch (📳), off by default, and only offered on devices that can do them.
 */

// --- The switch: a tiny external store, remembered in localStorage ----------------------

const KEY = "wsg-motion";
let enabled: boolean | null = null;
const listeners = new Set<() => void>();

export function getMotion(): boolean {
  if (enabled === null) {
    try {
      enabled = window.localStorage.getItem(KEY) === "1";
    } catch {
      enabled = false;
    }
  }
  return enabled;
}

export function setMotion(next: boolean): void {
  enabled = next;
  try {
    window.localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    // not remembered across visits, which is fine
  }
  if (!next) stopHaptics();
  listeners.forEach((l) => l());
}

export function subscribeMotion(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Touch devices that can vibrate or report motion. False on the server, and on laptops. */
export function motionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const touch = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  return touch && (typeof navigator.vibrate === "function" || "DeviceMotionEvent" in window);
}

// --- Vibration -------------------------------------------------------------------------

/**
 * Which ticks to feel. Early ticks come so fast they would blur into one long buzz, so only ticks at
 * least `minGapMs` after the previous felt one are kept: the vibration starts as the wheel slows
 * and then follows it tick by tick.
 */
export function feltTicks(times: number[], minGapMs = 110): number[] {
  const kept: number[] = [];
  for (const t of times) {
    if (kept.length === 0 || (t - kept[kept.length - 1]) * 1000 >= minGapMs) kept.push(t);
  }
  return kept;
}

const PULSE_MS = 14;
const LANDING_PATTERN = [40, 50, 40, 50, 90];
let pending: ReturnType<typeof setTimeout>[] = [];

function vibrate(pattern: number | number[]): void {
  try {
    if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  } catch {
    // some browsers throw without a recent tap; the spin still works
  }
}

/** Schedule a pulse for each felt tick (seconds after now). Call from the spin tap. */
export function startHaptics(times: number[]): void {
  stopHaptics();
  for (const t of feltTicks(times)) pending.push(setTimeout(() => vibrate(PULSE_MS), t * 1000));
}

/** The buzz when the wheel stops. */
export function landingBuzz(): void {
  vibrate(LANDING_PATTERN);
}

export function stopHaptics(): void {
  for (const id of pending) clearTimeout(id);
  pending = [];
  vibrate(0);
}

/** A short pulse, so turning the switch on is felt straight away. */
export function confirmBuzz(): void {
  vibrate(30);
}

// --- Shake to spin -----------------------------------------------------------------------

export interface ShakeOptions {
  /** Acceleration (m/s², gravity included; a phone at rest reads about 9.8) that counts as a hard jolt. */
  threshold?: number;
  /** How many jolts within `windowMs` make a shake. */
  jolts?: number;
  windowMs?: number;
  /** After a shake, ignore motion for this long. */
  lockoutMs?: number;
}

/**
 * Feed it the magnitude of each motion reading and its time (ms); it says when a shake just happened.
 * One bump (setting the phone down, a jolt in a pocket) is not a shake: it takes several hard jolts close together.
 */
export function createShakeDetector({ threshold = 24, jolts = 3, windowMs = 900, lockoutMs = 1500 }: ShakeOptions = {}) {
  let hits: number[] = [];
  let lockedUntil = -Infinity;
  let lastHit = -Infinity;
  return function feed(magnitude: number, now: number): boolean {
    if (now < lockedUntil || !Number.isFinite(magnitude) || magnitude < threshold) return false;
    // Readings arrive many times a second: count one jolt per ~120 ms.
    if (now - lastHit < 120) return false;
    lastHit = now;
    hits = hits.filter((t) => now - t <= windowMs);
    hits.push(now);
    if (hits.length >= jolts) {
      hits = [];
      lockedUntil = now + lockoutMs;
      return true;
    }
    return false;
  };
}

type MotionPermission = { requestPermission?: () => Promise<"granted" | "denied"> };

/** iPhones ask first (and only from a tap). Everywhere else this is simply true. */
export async function requestMotionPermission(): Promise<boolean> {
  const Motion = (typeof window !== "undefined" ? (window as unknown as { DeviceMotionEvent?: MotionPermission }).DeviceMotionEvent : undefined);
  if (Motion && typeof Motion.requestPermission === "function") {
    try {
      return (await Motion.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

/** Call `onShake` whenever the phone is shaken. Returns the function that stops listening. */
export function listenForShake(onShake: () => void, options?: ShakeOptions): () => void {
  const feed = createShakeDetector(options);
  const handler = (e: DeviceMotionEvent) => {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null || a.y === null || a.z === null) return;
    if (feed(Math.hypot(a.x, a.y, a.z), performance.now())) onShake();
  };
  window.addEventListener("devicemotion", handler);
  return () => window.removeEventListener("devicemotion", handler);
}
