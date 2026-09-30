export type CategoryId = "restaurants" | "cafes" | "bars" | "things";

export interface Place {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface GeocodeResult {
  lat: number;
  lon: number;
  label: string;
}
