import type { CategoryId } from "./types";
import { formatDistance, type Unit } from "./units";

export interface Category {
  id: CategoryId;
  label: string;
  emoji: string;
  /** Overpass QL tag filters; each entry becomes its own node/way query. */
  filters: string[];
}

export const CATEGORIES: Category[] = [
  {
    id: "restaurants",
    label: "Restaurants",
    emoji: "🍽️",
    filters: ['["amenity"="restaurant"]'],
  },
  {
    id: "cafes",
    label: "Cafés",
    emoji: "☕",
    filters: ['["amenity"="cafe"]'],
  },
  {
    id: "bars",
    label: "Bars",
    emoji: "🍻",
    filters: ['["amenity"="bar"]', '["amenity"="pub"]'],
  },
  {
    id: "things",
    label: "Things to do",
    emoji: "🎡",
    filters: [
      '["tourism"="attraction"]',
      '["tourism"="museum"]',
      '["tourism"="gallery"]',
      '["tourism"="viewpoint"]',
      '["leisure"="park"]',
      '["leisure"="bowling_alley"]',
      '["leisure"="escape_game"]',
      '["amenity"="cinema"]',
      '["amenity"="theatre"]',
      '["amenity"="arts_centre"]',
    ],
  },
];

export function getCategory(id: string | null): Category | undefined {
  return CATEGORIES.find((c) => c.id === id);
}

/** Slices on the wheel. */
export const MAX_PLACES = 8;
/** Nearest candidates the API returns, so filters can drop some and the wheel still fills. */
export const POOL_SIZE = 32;

export const MIN_RADIUS = 500;
export const MAX_RADIUS = 5000;
export const DEFAULT_RADIUS = 1000;
export const RADIUS_STEP = 250;

/** Clamp to the allowed range and snap to the slider step. */
export function snapRadius(value: number): number {
  const snapped = Math.round(value / RADIUS_STEP) * RADIUS_STEP;
  return Math.min(MAX_RADIUS, Math.max(MIN_RADIUS, snapped));
}

export function formatRadius(meters: number, unit: Unit = "km"): string {
  return formatDistance(meters, unit);
}
