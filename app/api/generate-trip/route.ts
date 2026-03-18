import { NextResponse } from "next/server";
import { generateTripPlan } from "@/lib/trip/engine";
import { normalizePlanningInput } from "@/lib/trip/normalizeInput";
import { experienceMetadataList } from "@/data/trip/experienceMetadata";
import type { UserVector } from "@/lib/trip/types";
import { DEFAULT_USER_VECTOR } from "@/lib/trip/constants";

type GenerateTripRequest = {
  primaryResult?: {
    userVector?: Partial<UserVector>;
  };
  secondaryAnswers?: Record<string, any>;
};

function mergeUserVector(partial?: Partial<UserVector>): UserVector {
  return {
    ...DEFAULT_USER_VECTOR,
    ...(partial ?? {}),
  };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GenerateTripRequest;

    const primaryResult = body.primaryResult ?? {};
    const secondaryAnswers = body.secondaryAnswers ?? {};

    const userVector = mergeUserVector(primaryResult.userVector);
    const planningInput = normalizePlanningInput(secondaryAnswers);

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
