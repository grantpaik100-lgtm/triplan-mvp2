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
  planningInput?: any;
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
  allowed_times: string[] | null;
  time_flexibility: string | null;
  min_duration: number;
  recommended_duration: number;
  fatigue: number;
  is_meal: boolean;
  is_indoor: boolean;
  is_night_friendly: boolean;
  companion_fit: Record<string, number> | null;
  features: Record<string, number> | null;
  priority_hints: Record<string, unknown> | null;
  review: Record<string, unknown> | null;
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

function toCategory(value: string): ExperienceMetadata["category"] {
  return value as ExperienceMetadata["category"];
}

function toPlaceType(value: string): ExperienceMetadata["placeType"] {
  return value as ExperienceMetadata["placeType"];
}

function toMacroAction(value: string): ExperienceMetadata["macroAction"] {
  return value as ExperienceMetadata["macroAction"];
}

function toMicroAction(value: string): ExperienceMetadata["microAction"] {
  return value as ExperienceMetadata["microAction"];
}

function toActionStrength(value: number): ExperienceMetadata["actionStrength"] {
  return value as ExperienceMetadata["actionStrength"];
}

function toPreferredTime(
  value: string | null,
): ExperienceMetadata["preferredTime"] {
  return (value ?? "afternoon") as ExperienceMetadata["preferredTime"];
}

function toAllowedTimes(
  value: string[] | null | undefined,
): ExperienceMetadata["allowedTimes"] {
  return (value ?? []) as ExperienceMetadata["allowedTimes"];
}

function toTimeFlexibility(
  value: string | null,
): ExperienceMetadata["timeFlexibility"] {
  return (value ?? "medium") as ExperienceMetadata["timeFlexibility"];
}

function toFatigue(value: number): ExperienceMetadata["fatigue"] {
  return value as ExperienceMetadata["fatigue"];
}

function toCompanionFit(
  value: Record<string, number> | null | undefined,
): ExperienceMetadata["companionFit"] {
  return (value ?? {}) as ExperienceMetadata["companionFit"];
}

function toFeatures(
  value: Record<string, number> | null | undefined,
): ExperienceMetadata["features"] {
  return (value ?? {}) as ExperienceMetadata["features"];
}

function toPriorityHints(
  value: Record<string, unknown> | null | undefined,
): ExperienceMetadata["priorityHints"] {
  return (value ?? {}) as ExperienceMetadata["priorityHints"];
}

function toReview(
  value: Record<string, unknown> | null | undefined,
): ExperienceMetadata["review"] {
  return (value ?? {}) as ExperienceMetadata["review"];
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
    category: toCategory(row.category),
    placeType: toPlaceType(row.place_type),
    macroAction: toMacroAction(row.macro_action),
    microAction: toMicroAction(row.micro_action),
    actionStrength: toActionStrength(row.action_strength),
    isPrimaryAction: row.is_primary_action,
    baseExperienceLabel: row.base_experience_label,
    preferredTime: toPreferredTime(row.preferred_time),
    allowedTimes: toAllowedTimes(row.allowed_times),
    timeFlexibility: toTimeFlexibility(row.time_flexibility),
    minDuration: row.min_duration,
    recommendedDuration: row.recommended_duration,
    fatigue: toFatigue(row.fatigue),
    isMeal: row.is_meal,
    isIndoor: row.is_indoor,
    isNightFriendly: row.is_night_friendly,
    companionFit: toCompanionFit(row.companion_fit),
    features: toFeatures(row.features),
    priorityHints: toPriorityHints(row.priority_hints),
    review: toReview(row.review),
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

    const planningInput =
      body.planningInput ?? normalizePlanningInput(secondaryAnswers);

    

    const experienceMetadataList = await fetchExperienceMetadataList();

    console.log("[generate-trip] metadata count:", experienceMetadataList.length);
    console.log("[generate-trip] planningInput", planningInput);

    console.log("[generate-trip] experienceCount", experiences.length);
    console.log("[generate-trip] tripDays", planningInput.days);
    

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
