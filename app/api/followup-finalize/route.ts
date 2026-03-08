import OpenAI from "openai";
import {
  type FollowupSeed,
  type PlanningInput,
  type FollowupFinalizeResponse,
} from "@/types/tripPlanning";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function toLowerText(value: string | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function buildRuleBasedPlanningInput(params: {
  seed: FollowupSeed;
  followupAnswers: Record<string, string>;
  followupSource: "openai" | "fallback";
}): PlanningInput {
  const { seed, followupAnswers, followupSource } = params;

  const rawValues = Object.values(followupAnswers);
  const joined = rawValues.join(" ").trim();
  const normalized = toLowerText(joined);

  const mustIncludeRest =
    normalized.includes("휴식") ||
    normalized.includes("여유") ||
    normalized.includes("천천히");

  const prioritizeFood =
    normalized.includes("음식") ||
    normalized.includes("맛집") ||
    normalized.includes("먹") ||
    normalized.includes("미식");

  const avoidLongTransit =
    normalized.includes("이동") ||
    normalized.includes("멀지") ||
    normalized.includes("오래 걷") ||
    normalized.includes("동선");

  const keepScheduleLoose =
    normalized.includes("여유") ||
    normalized.includes("느긋") ||
    normalized.includes("빡빡하지") ||
    normalized.includes("휴식");

  const preferEfficientRoute =
    normalized.includes("효율") ||
    normalized.includes("동선") ||
    normalized.includes("가깝") ||
    normalized.includes("최소");

  const specialGoal =
    followupAnswers.special_goal ??
    followupAnswers.trip_goal ??
    followupAnswers.must_do ??
    null;

  const foodImportance =
    followupAnswers.food_importance ??
    (prioritizeFood ? "어느 정도 중요하다" : null);

  const interpretedNeeds: string[] = [];
  const planningNotes: string[] = [];

  if (mustIncludeRest) interpretedNeeds.push("휴식 비중 확대");
  if (prioritizeFood) interpretedNeeds.push("음식 경험 반영");
  if (avoidLongTransit) interpretedNeeds.push("긴 이동 최소화");
  if (keepScheduleLoose) interpretedNeeds.push("느슨한 일정 유지");
  if (preferEfficientRoute) interpretedNeeds.push("효율적 동선 우선");

  if (specialGoal) planningNotes.push(`핵심 목표: ${specialGoal}`);

  return {
    source: {
      seedSource: seed.source ?? "unknown",
      seedCreatedAt: seed.createdAt ?? new Date().toISOString(),
      followupSource,
      finalizeSource: "rule_based_fallback",
    },

    original: {
      summary: seed.summary,
      rawAnswers: seed.rawAnswers,
      followupRawAnswers: followupAnswers,
    },

    profile: {
      travelStyle: null,
      pacePreference: followupAnswers.pace ?? null,
      foodImportance,
      emotionalTone: null,
    },

    tripContext: {
      destination: null,
      duration: null,
      companions: null,
      groupSize: null,
      budgetLevel: null,
      transportPreference: null,
      lodgingPreference: null,
    },

    constraints: {
      dietary: [],
      mobility: [],
      schedule: keepScheduleLoose ? ["느슨한 일정 선호"] : [],
    },

    followup: {
      interpretedNeeds,
      specialGoal,
      emotionalContext: null,
      planningNotes,
    },

    planningDirectives: {
      mustIncludeRest,
      prioritizeFood,
      avoidLongTransit,
      keepScheduleLoose,
      preferEfficientRoute,
    },
  };
}

function buildPrompt(params: {
  seed: FollowupSeed;
  followupAnswers: Record<string, string>;
  followupSource: "openai" | "fallback";
}) {
  const { seed, followupAnswers, followupSource } = params;

  return `
You are converting TriPlan travel survey data into a stable planning JSON.

Your goals:
1. Interpret follow-up answers in Korean.
2. Produce a normalized JSON object for a travel itinerary algorithm.
3. Be conservative and stable.
4. Do not invent highly specific facts.
5. If unknown, use null or empty arrays.
6. Return JSON only.
7. Do not wrap in markdown.

Return this exact shape:

{
  "profile": {
    "travelStyle": "string | null",
    "pacePreference": "string | null",
    "foodImportance": "string | null",
    "emotionalTone": "string | null"
  },
  "tripContext": {
    "destination": "string | null",
    "duration": "string | null",
    "companions": "string | null",
    "groupSize": "string | null",
    "budgetLevel": "string | null",
    "transportPreference": "string | null",
    "lodgingPreference": "string | null"
  },
  "constraints": {
    "dietary": ["string"],
    "mobility": ["string"],
    "schedule": ["string"]
  },
  "followup": {
    "interpretedNeeds": ["string"],
    "specialGoal": "string | null",
    "emotionalContext": "string | null",
    "planningNotes": ["string"]
  },
  "planningDirectives": {
    "mustIncludeRest": true,
    "prioritizeFood": false,
    "avoidLongTransit": false,
    "keepScheduleLoose": true,
    "preferEfficientRoute": false
  }
}

Seed source:
${JSON.stringify({
  source: seed.source,
  createdAt: seed.createdAt,
  summary: seed.summary,
  rawAnswers: seed.rawAnswers,
})}

Followup source:
${JSON.stringify({ followupSource })}

Followup answers:
${JSON.stringify(followupAnswers)}
`;
}

function coerceStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function cleanPlanningInput(params: {
  seed: FollowupSeed;
  followupAnswers: Record<string, string>;
  followupSource: "openai" | "fallback";
  input: unknown;
}): PlanningInput | null {
  const { seed, followupAnswers, followupSource, input } = params;

  if (!input || typeof input !== "object") return null;

  const obj = input as {
    profile?: Record<string, unknown>;
    tripContext?: Record<string, unknown>;
    constraints?: Record<string, unknown>;
    followup?: Record<string, unknown>;
    planningDirectives?: Record<string, unknown>;
  };

  const profile = obj.profile ?? {};
  const tripContext = obj.tripContext ?? {};
  const constraints = obj.constraints ?? {};
  const followup = obj.followup ?? {};
  const directives = obj.planningDirectives ?? {};

  return {
    source: {
      seedSource: seed.source ?? "unknown",
      seedCreatedAt: seed.createdAt ?? new Date().toISOString(),
      followupSource,
      finalizeSource: "openai",
    },

    original: {
      summary: seed.summary,
      rawAnswers: seed.rawAnswers,
      followupRawAnswers: followupAnswers,
    },

    profile: {
      travelStyle: coerceStringOrNull(profile.travelStyle),
      pacePreference: coerceStringOrNull(profile.pacePreference),
      foodImportance: coerceStringOrNull(profile.foodImportance),
      emotionalTone: coerceStringOrNull(profile.emotionalTone),
    },

    tripContext: {
      destination: coerceStringOrNull(tripContext.destination),
      duration: coerceStringOrNull(tripContext.duration),
      companions: coerceStringOrNull(tripContext.companions),
      groupSize: coerceStringOrNull(tripContext.groupSize),
      budgetLevel: coerceStringOrNull(tripContext.budgetLevel),
      transportPreference: coerceStringOrNull(tripContext.transportPreference),
      lodgingPreference: coerceStringOrNull(tripContext.lodgingPreference),
    },

    constraints: {
      dietary: coerceStringArray(constraints.dietary),
      mobility: coerceStringArray(constraints.mobility),
      schedule: coerceStringArray(constraints.schedule),
    },

    followup: {
      interpretedNeeds: coerceStringArray(followup.interpretedNeeds),
      specialGoal: coerceStringOrNull(followup.specialGoal),
      emotionalContext: coerceStringOrNull(followup.emotionalContext),
      planningNotes: coerceStringArray(followup.planningNotes),
    },

    planningDirectives: {
      mustIncludeRest: Boolean(directives.mustIncludeRest),
      prioritizeFood: Boolean(directives.prioritizeFood),
      avoidLongTransit: Boolean(directives.avoidLongTransit),
      keepScheduleLoose: Boolean(directives.keepScheduleLoose),
      preferEfficientRoute: Boolean(directives.preferEfficientRoute),
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const seed = body?.seed as FollowupSeed | undefined;
    const followupAnswers = body?.followupAnswers as Record<string, string> | undefined;
    const followupSource =
      body?.followupSource === "openai" ? "openai" : "fallback";

    if (!seed || !followupAnswers) {
      const fallback = buildRuleBasedPlanningInput({
        seed: seed ?? {
          source: "unknown",
          createdAt: new Date().toISOString(),
          summary: null,
          rawAnswers: null,
        },
        followupAnswers: followupAnswers ?? {},
        followupSource,
      });

      const result: FollowupFinalizeResponse = {
        source: "rule_based_fallback",
        planningInput: fallback,
        error: "missing_seed_or_answers",
      };

      return Response.json(result);
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You convert travel survey data into stable JSON for itinerary planning. Return strict JSON only.",
        },
        {
          role: "user",
          content: buildPrompt({
            seed,
            followupAnswers,
            followupSource,
          }),
        },
      ],
    });

    const text = response.choices?.[0]?.message?.content;

    if (!text) {
      const fallback = buildRuleBasedPlanningInput({
        seed,
        followupAnswers,
        followupSource,
      });

      const result: FollowupFinalizeResponse = {
        source: "rule_based_fallback",
        planningInput: fallback,
        error: "empty_openai_response",
      };

      return Response.json(result);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      const fallback = buildRuleBasedPlanningInput({
        seed,
        followupAnswers,
        followupSource,
      });

      const result: FollowupFinalizeResponse = {
        source: "rule_based_fallback",
        planningInput: fallback,
        error: "json_parse_failed",
      };

      return Response.json(result);
    }

    const cleaned = cleanPlanningInput({
      seed,
      followupAnswers,
      followupSource,
      input: parsed,
    });

    if (!cleaned) {
      const fallback = buildRuleBasedPlanningInput({
        seed,
        followupAnswers,
        followupSource,
      });

      const result: FollowupFinalizeResponse = {
        source: "rule_based_fallback",
        planningInput: fallback,
        error: "invalid_planning_input_shape",
      };

      return Response.json(result);
    }

    const result: FollowupFinalizeResponse = {
      source: "openai",
      planningInput: cleaned,
    };

    return Response.json(result);
  } catch (error) {
    console.error("followup-finalize error", error);

    const seed: FollowupSeed = {
      source: "unknown",
      createdAt: new Date().toISOString(),
      summary: null,
      rawAnswers: null,
    };

    const fallback = buildRuleBasedPlanningInput({
      seed,
      followupAnswers: {},
      followupSource: "fallback",
    });

    const result: FollowupFinalizeResponse = {
      source: "rule_based_fallback",
      planningInput: fallback,
      error: "openai_request_failed",
    };

    return Response.json(result);
  }
}
