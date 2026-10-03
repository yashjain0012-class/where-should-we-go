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
