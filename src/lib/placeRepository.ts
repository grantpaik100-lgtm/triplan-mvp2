import { supabase } from "@/lib/supabase";
import type { Place, PlaceVector } from "@/engine/types";

type PlaceRow = {
  id: string;
  name: string;
  region: string | null;
  category: string | null;
  lat: number | null;
  lng: number | null;
  avg_duration_min: number | null;
  price_level: number | null;
  crowd_level: number | null;
  status: string | null;
  place_vectors: Array<{
    food: number | null;
    culture: number | null;
    nature: number | null;
    shopping: number | null;
    activity: number | null;
    atmosphere: number | null;
    tourism: number | null;
    price: number | null;
    crowd: number | null;
    duration: number | null;
  }> | null;
};

function normalizeVector(raw?: PlaceRow["place_vectors"][number] | null): PlaceVector | null {
  if (!raw) return null;

  return {
    food: raw.food ?? 0,
    culture: raw.culture ?? 0,
    nature: raw.nature ?? 0,
    shopping: raw.shopping ?? 0,
    activity: raw.activity ?? 0,
    atmosphere: raw.atmosphere ?? 0,
    tourism: raw.tourism ?? 0,
    price: raw.price ?? 0,
    crowd: raw.crowd ?? 0,
    duration: raw.duration ?? 0,
  };
}

export async function getPlacesWithVectors(): Promise<Place[]> {
  const { data, error } = await supabase
    .from("places")
    .select(`
      id,
      name,
      region,
      category,
      lat,
      lng,
      avg_duration_min,
      price_level,
      crowd_level,
      status,
      place_vectors (
        food,
        culture,
        nature,
        shopping,
        activity,
        atmosphere,
        tourism,
        price,
        crowd,
        duration
      )
    `)
    .eq("status", "active");

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as PlaceRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    region: row.region,
    category: row.category,
    lat: row.lat,
    lng: row.lng,
    avg_duration_min: row.avg_duration_min,
    price_level: row.price_level,
    crowd_level: row.crowd_level,
    status: row.status,
    vector: normalizeVector(row.place_vectors?.[0] ?? null),
  }));
}

export async function getPlaceByIds(placeIds: string[]): Promise<Place[]> {
  if (placeIds.length === 0) return [];

  const { data, error } = await supabase
    .from("places")
    .select(`
      id,
      name,
      region,
      category,
      lat,
      lng,
      avg_duration_min,
      price_level,
      crowd_level,
      status,
      place_vectors (
        food,
        culture,
        nature,
        shopping,
        activity,
        atmosphere,
        tourism,
        price,
        crowd,
        duration
      )
    `)
    .in("id", placeIds);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as PlaceRow[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    region: row.region,
    category: row.category,
    lat: row.lat,
    lng: row.lng,
    avg_duration_min: row.avg_duration_min,
    price_level: row.price_level,
    crowd_level: row.crowd_level,
    status: row.status,
    vector: normalizeVector(row.place_vectors?.[0] ?? null),
  }));
}
