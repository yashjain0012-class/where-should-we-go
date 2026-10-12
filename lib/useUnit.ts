"use client";

import { useSyncExternalStore } from "react";
import { getUnit, subscribeUnit, type Unit } from "./units";

/** The distance unit in use. "km" for the server render and first paint, then the real choice. */
export function useUnit(): Unit {
  return useSyncExternalStore(subscribeUnit, getUnit, () => "km" as Unit);
}
