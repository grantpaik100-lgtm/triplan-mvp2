import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateTripPlan } from "@/lib/trip/engine";
import { normalizePlanningInput } from "@/lib/trip/normalizeInput";
import type { ExperienceMetadata, UserVector } from "@/lib/trip/types";
import { DEFAULT_USER_VECTOR } from "@/lib/trip/constants";

type GenerateTripRequest = {
  primaryResult?: {
    userVector?: Partial<UserVector>;
  };
  secondaryAnswers?: Record<string, any>;
};

type ExperienceMetadataRow = {
  id: string;
  place_id: string;
  place_name: string;
  region_raw: string;
  area: string;
  category: string;
  place_type: string;
  macro_action: string;
  micro_action: string;
  action_strength: number;
  is_primary_action: boolean;
  base_experience_label: string;
  preferred_time: string | null;
  allowed_times: string[];
  time_flexibility: string | null;
  min_duration: number;
  recommended_duration: number;
  fatigue: number;
  is_meal: boolean;
  is_indoor: boolean;
  is_night_friendly: boolean;
  companion_fit: Record<string, number>;
  features: Record<string, number>;
  priority_hints: Record<string, unknown>;
  review: Record<string, unknown>;
};

function mergeUserVector(partial?: Partial<UserVector>): UserVector {
  return {
    ...DEFAULT_USER_VECTOR,
    ...(partial ?? {}),
  };
}

function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing env: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  return createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function toArea(value: string): ExperienceMetadata["area"] {
  return value as ExperienceMetadata["area"];
}

function mapRowToExperienceMetadata(
  row: ExperienceMetadataRow,
): ExperienceMetadata {
  return {
    id: row.id,
    placeId: row.place_id,
    placeName: row.place_name,
    regionRaw: row.region_raw,
    area: toArea(row.area),
    category: row.category,
    placeType: row.place_type,
    macroAction: row.macro_action,
    microAction: row.micro_action,
    actionStrength: row.action_strength,
    isPrimaryAction: row.is_primary_action,
    baseExperienceLabel: row.base_experience_label,
    preferredTime: row.preferred_time ?? undefined,
    allowedTimes: row.allowed_times ?? [],
    timeFlexibility: row.time_flexibility ?? undefined,
    minDuration: row.min_duration,
    recommendedDuration: row.recommended_duration,
    fatigue: row.fatigue,
    isMeal: row.is_meal,
    isIndoor: row.is_indoor,
    isNightFriendly: row.is_night_friendly,
    companionFit: row.companion_fit ?? {},
    features: row.features ?? {},
    priorityHints: row.priority_hints ?? {},
    review: row.review ?? {},
  };
}

async function fetchExperienceMetadataList(): Promise<ExperienceMetadata[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from("trip_experience_metadata_v3")
    .select(`
      id,
      place_id,
      place_name,
      region_raw,
      area,
      category,
      place_type,
      macro_action,
      micro_action,
      action_strength,
      is_primary_action,
      base_experience_label,
      preferred_time,
      allowed_times,
      time_flexibility,
      min_duration,
      recommended_duration,
      fatigue,
      is_meal,
      is_indoor,
      is_night_friendly,
      companion_fit,
      features,
      priority_hints,
      review
    `)
    .order("id", { ascending: true });

  if (error) {
    throw error;
  }

  return (data as ExperienceMetadataRow[]).map(mapRowToExperienceMetadata);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GenerateTripRequest;

    const primaryResult = body.primaryResult ?? {};
    const secondaryAnswers = body.secondaryAnswers ?? {};

    const userVector = mergeUserVector(primaryResult.userVector);
    const planningInput = normalizePlanningInput(secondaryAnswers);
    const experienceMetadataList = await fetchExperienceMetadataList();

    const result = generateTripPlan(
      userVector,
      planningInput,
      experienceMetadataList,
    );

    return NextResponse.json({
      ok: true,
      result,
    });
  } catch (error) {
    console.error("[generate-trip] failed:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "Failed to generate trip plan",
      },
      { status: 500 },
    );
  }
}
