import type { CategoryId } from "./types";

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

export const MAX_PLACES = 8;
export const RADIUS_METERS = 1000;
