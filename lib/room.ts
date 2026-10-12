/**
 * Live rooms: a host shares a link, friends open it and see the same wheel, each can veto one option,
 * and the host's device does the spin so everyone sees the same result. Nothing is stored anywhere:
 * the devices talk to each other directly (WebRTC, set up through PeerJS), and the room ends when the host leaves.
 *
 * This file is the protocol only: message shapes, strict validation of anything received, and the rules
 * for vetoes. It has no network code, so it can be tested on its own.
 */

import { clean } from "./share";

export const ROOM_VERSION = 1;
export const MAX_ROOM_OPTIONS = 16;
export const MAX_ROOM_GUESTS = 12;
const MAX_NAME = 80;
const MAX_ID = 64;
const MAX_WEIGHT = 5;
const MIN_SPIN_MS = 500;
const MAX_SPIN_MS = 15_000;

export interface RoomOption {
  id: string;
  name: string;
  weight: number;
}

/** What the host tells a guest about the wheel. */
export interface RoomState {
  t: "state";
  v: typeof ROOM_VERSION;
  options: RoomOption[];
  /** How many people are in the room, host included. */
  people: number;
  /** Whether this guest can still veto (once each, and never below two options). */
  canVeto: boolean;
}

export interface SpinMessage {
  t: "spin";
  /** The option the wheel will stop on. */
  winnerId: string;
  ms: number;
}

export interface ClosedMessage {
  t: "closed";
}

export type HostMessage = RoomState | SpinMessage | ClosedMessage;

export interface VetoMessage {
  t: "veto";
  id: string;
}

export type GuestMessage = VetoMessage;

// --- Room codes and links ----------------------------------------------------------------

// No 0/O, 1/I/l: easy to read out loud.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const CODE_LENGTH = 6;
const CODE_PATTERN = new RegExp(`^[${ALPHABET}]{${CODE_LENGTH}}$`);

/** A random room code. `random` is injectable for tests; the default is cryptographically random. */
export function newRoomCode(random: (n: number) => number = defaultRandom): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[random(ALPHABET.length)];
  return code;
}

function defaultRandom(n: number): number {
  const buffer = new Uint32Array(1);
  // Rejection sampling, so every letter is equally likely.
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  do crypto.getRandomValues(buffer);
  while (buffer[0] >= limit);
  return buffer[0] % n;
}

export function isRoomCode(code: unknown): code is string {
  return typeof code === "string" && CODE_PATTERN.test(code);
}

/** The id the host registers with the PeerJS broker. */
export const peerIdFor = (code: string) => `wsg-${code}`;

export const roomHash = (code: string) => `#r=${code}`;

/** "#r=abc234" gives "abc234"; anything else gives null. Trailing punctuation from a chat app is tolerated. */
export function parseRoomHash(hash: string): string | null {
  if (!hash.startsWith("#r=")) return null;
  const code = hash.slice(3).replace(/[^a-z0-9]+$/i, "").toLowerCase();
  return isRoomCode(code) ? code : null;
}

// --- Validating what arrives -----------------------------------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parseOption(v: unknown): RoomOption | null {
  if (!isObject(v)) return null;
  const { id, name, weight } = v;
  if (typeof id !== "string" || id.length === 0 || id.length > MAX_ID) return null;
  if (typeof name !== "string") return null;
  const cleaned = clean(name);
  if (!cleaned || cleaned.length > MAX_NAME) return null;
  if (typeof weight !== "number" || !Number.isInteger(weight) || weight < 1 || weight > MAX_WEIGHT) return null;
  return { id, name: cleaned, weight };
}

/** What a guest receives. Returns null for anything malformed, so a bad or hostile message is simply ignored. */
export function parseHostMessage(raw: unknown): HostMessage | null {
  if (!isObject(raw)) return null;
  if (raw.t === "closed") return { t: "closed" };
  if (raw.t === "spin") {
    const { winnerId, ms } = raw;
    if (typeof winnerId !== "string" || winnerId.length === 0 || winnerId.length > MAX_ID) return null;
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms < MIN_SPIN_MS || ms > MAX_SPIN_MS) return null;
    return { t: "spin", winnerId, ms };
  }
  if (raw.t === "state") {
    if (raw.v !== ROOM_VERSION || !Array.isArray(raw.options)) return null;
    if (raw.options.length < 1 || raw.options.length > MAX_ROOM_OPTIONS) return null;
    const options: RoomOption[] = [];
    const seen = new Set<string>();
    for (const o of raw.options) {
      const parsed = parseOption(o);
      if (!parsed || seen.has(parsed.id)) return null;
      seen.add(parsed.id);
      options.push(parsed);
    }
    const { people, canVeto } = raw;
    if (typeof people !== "number" || !Number.isInteger(people) || people < 1 || people > MAX_ROOM_GUESTS + 1) return null;
    if (typeof canVeto !== "boolean") return null;
    return { t: "state", v: ROOM_VERSION, options, people, canVeto };
  }
  return null;
}

/** What the host receives from a guest. */
export function parseGuestMessage(raw: unknown): GuestMessage | null {
  if (!isObject(raw) || raw.t !== "veto") return null;
  const { id } = raw;
  if (typeof id !== "string" || id.length === 0 || id.length > MAX_ID) return null;
  return { t: "veto", id };
}

// --- Host rules ----------------------------------------------------------------------

export type VetoResult =
  | { ok: true; options: RoomOption[] }
  | { ok: false; reason: "already-used" | "unknown-option" | "too-few" };

/** Never below two options, one veto per guest, and the option has to exist. */
export function applyVeto(options: RoomOption[], vetoId: string, alreadyVetoed: boolean): VetoResult {
  if (alreadyVetoed) return { ok: false, reason: "already-used" };
  if (!options.some((o) => o.id === vetoId)) return { ok: false, reason: "unknown-option" };
  if (options.length <= 2) return { ok: false, reason: "too-few" };
  return { ok: true, options: options.filter((o) => o.id !== vetoId) };
}

export function canGuestVeto(options: RoomOption[], alreadyVetoed: boolean): boolean {
  return !alreadyVetoed && options.length > 2;
}

/** The message for one guest. */
export function stateFor(options: RoomOption[], people: number, alreadyVetoed: boolean): RoomState {
  return { t: "state", v: ROOM_VERSION, options, people, canVeto: canGuestVeto(options, alreadyVetoed) };
}
