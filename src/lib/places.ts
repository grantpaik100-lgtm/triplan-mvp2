import { supabase } from "@/lib/supabase";

export type PlaceVector = {
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
};

export type Place = {
  id: string;
  name: string;
  region: string | null;
  category: string | null;
  avg_duration_min: number | null;
  vector: PlaceVector | null;
};

export async function getPlacesWithVectors(): Promise<Place[]> {
  const { data, error } = await supabase
    .from("places")
    .select(`
      id,
      name,
      region,
      category,
      avg_duration_min,
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
    `);

  if (error) {
    console.error("Supabase error:", error);
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    name: row.name,
    region: row.region,
    category: row.category,
    avg_duration_min: row.avg_duration_min,
    vector: row.place_vectors?.[0] ?? null
  }));
}
