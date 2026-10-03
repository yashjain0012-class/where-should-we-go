/**
 * The ticking sound, synthesized in the browser with the Web Audio API (no audio files),
 * and the mute switch. Each tick is a very short filtered-noise click plus a soft
 * low "knock"; both get a little lower and quieter as the wheel slows down.
 */

// --- Mute switch: a tiny external store, remembered in localStorage -------------------

const MUTE_KEY = "wsg-muted";
let muted: boolean | null = null;
const listeners = new Set<() => void>();

export function getMuted(): boolean {
  if (muted === null) {
    try {
      muted = window.localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      muted = false; // storage blocked (private window, etc.): default to sound on
    }
  }
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  } catch {
    // not remembered across visits, which is fine
  }
  if (next) stopTicks();
  listeners.forEach((l) => l());
}

export function subscribeMuted(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// --- Audio -----------------------------------------------------------------------------

/** Lead time so the first tick lines up with the first frame of the CSS animation. */
const START_LATENCY_S = 0.03;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let live: AudioScheduledSourceNode[] = [];

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Browsers only allow audio to start after a tap. Call this from a click handler. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state === "suspended") void c.resume();
}

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (!noise) {
    const length = Math.floor(c.sampleRate * 0.04);
    noise = c.createBuffer(1, length, c.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

function scheduleTick(c: AudioContext, out: AudioNode, at: number, progress: number): void {
  // progress: 0 at the start of the spin, 1 at the end
  const slowness = Math.min(1, Math.max(0, progress));
  const loudness = 0.9 - 0.45 * slowness;

  // The click: a burst of noise through a band-pass filter.
  const click = c.createBufferSource();
  click.buffer = noiseBuffer(c);
  const filter = c.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2600 - 1100 * slowness;
  filter.Q.value = 3;
  const clickGain = c.createGain();
  clickGain.gain.setValueAtTime(0.0001, at);
  clickGain.gain.exponentialRampToValueAtTime(loudness, at + 0.0015);
  clickGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
  click.connect(filter).connect(clickGain).connect(out);
  click.start(at);
  click.stop(at + 0.04);

  // The knock: a short low sine that gives the click some body.
  const knock = c.createOscillator();
  knock.type = "sine";
  knock.frequency.setValueAtTime(420 - 140 * slowness, at);
  const knockGain = c.createGain();
  knockGain.gain.setValueAtTime(0.0001, at);
  knockGain.gain.exponentialRampToValueAtTime(loudness * 0.5, at + 0.002);
  knockGain.gain.exponentialRampToValueAtTime(0.0001, at + 0.035);
  knock.connect(knockGain).connect(out);
  knock.start(at);
  knock.stop(at + 0.045);

  live.push(click, knock);
  click.onended = () => {
    click.disconnect();
    filter.disconnect();
    clickGain.disconnect();
    live = live.filter((n) => n !== click);
  };
  knock.onended = () => {
    knock.disconnect();
    knockGain.disconnect();
    live = live.filter((n) => n !== knock);
  };
}

/**
 * Schedule one tick per entry of `times` (seconds after the spin starts). Call from the
 * click that starts the spin. Does nothing when muted or when audio isn't available.
 */
export function playTicks(times: number[], durationSeconds: number): void {
  if (getMuted() || times.length === 0) return;
  const c = context();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  stopTicks();
  master = c.createGain();
  master.gain.value = 0.35;
  master.connect(c.destination);
  const start = c.currentTime + START_LATENCY_S;
  for (const t of times) scheduleTick(c, master, start + t, t / durationSeconds);
}

/** Cut the sound off right away (spin interrupted, page left, or sound muted). */
export function stopTicks(): void {
  for (const node of live) {
    try {
      node.stop();
    } catch {
      // already stopped
    }
  }
  live = [];
  if (master) {
    master.disconnect();
    master = null;
  }
}
