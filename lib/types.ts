export type CategoryId = "restaurants" | "cafes" | "bars" | "things";

export interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Metres from the search centre (search results only). */
  distance?: number;
  /** Raw OpenStreetMap opening_hours tag, if the place has one (search results only). */
  hours?: string;
  /** Cuisine, diet, accessibility and similar tags the place has in OpenStreetMap (search results only). */
  attrs?: PlaceAttrs;
}

/** What OpenStreetMap says about a place. A missing field means "not tagged", never "no". */
export interface PlaceAttrs {
  /** Primary kind, e.g. "restaurant", "park", "museum". */
  kind?: string;
  /** Lower-case cuisines, at most 3, e.g. ["italian", "pizza"]. */
  cuisine?: string[];
  vegetarian?: "yes" | "only" | "no";
  vegan?: "yes" | "only" | "no";
  outdoorSeating?: boolean;
  wheelchair?: "yes" | "limited" | "no";
  takeaway?: "yes" | "only" | "no";
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
}

export interface PlacesResponse {
  /** Nearest first, up to POOL_SIZE. */
  places: Place[];
  /** IANA time zone of the search centre, used to evaluate opening hours. */
  tz: string | null;
}

export type OpenState = "open" | "closed" | "unknown";
