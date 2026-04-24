/**
 * TriPlan V3
 * Current Role:
 * - followup 종료 시 slot/result를 기반으로 최종 planningInput을 생성하는 API endpoint다.
 *
 * Target Role:
 * - Secondary -> PlanningInput 변환의 공식 finalize endpoint로 유지되어야 한다.
 *
 * Chain:
 * - followup
 *
 * Inputs:
 * - followup messages
 * - slot state
 * - original seed/raw answers
 *
 * Outputs:
 * - planningInput
 *
 * Called From:
 * - app/followup/FollowupMiniApp.tsx
 *
 * Side Effects:
 * - 없음 또는 model-assisted synthesis
 *
 * Current Status:
 * - canonical
 *
 * Decision:
 * - keep
 *
 * Move Target:
 * - 없음
 *
 * Notes:
 * - generate 단계의 진짜 입력은 이 결과물이다.
 * - 삭제 금지.
 */
import OpenAI from "openai";
import type {
  ChatMessage,
  ExtractedSlots,
  FinalizeChatResponse,
  FollowupContext,
  FollowupSeed,
} from "@/types/followupChat";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function normalizeSlots(input: unknown): ExtractedSlots {
  if (!input || typeof input !== "object") return {};

  const obj = input as Record<string, unknown>;

  function pick(key: keyof ExtractedSlots): string | null | undefined {
    const value = obj[key];
    return typeof value === "string" && value.trim().length > 0 ? value : null;
  }

  return {
    pacePreference: pick("pacePreference"),
    restPriority: pick("restPriority"),
    foodImportance: pick("foodImportance"),
    waitingTolerance: pick("waitingTolerance"),
    mobilityConstraint: pick("mobilityConstraint"),
    transportPreference: pick("transportPreference"),
    specialGoal: pick("specialGoal"),
    emotionalContext: pick("emotionalContext"),
  };
}

function ruleBasedFollowupContext(params: {
  seed: FollowupSeed;
  messages: ChatMessage[];
  slots: ExtractedSlots;
}): FollowupContext {
  const { seed, messages, slots } = params;

  const mobilityText = (slots.mobilityConstraint ?? "").toLowerCase();
  const paceText = (slots.pacePreference ?? "").toLowerCase();
  const restText = (slots.restPriority ?? "").toLowerCase();
  const foodText = (slots.foodImportance ?? "").toLowerCase();
  const transportText = (slots.transportPreference ?? "").toLowerCase();
  const emotionalText = slots.emotionalContext ?? null;

  return {
    source: {
      seedSource: seed.source ?? "unknown",
      seedCreatedAt: seed.createdAt ?? new Date().toISOString(),
      finalizeSource: "rule_based_fallback",
    },
    raw: {
      surveySummary: seed.summary,
      surveyRawAnswers: seed.rawAnswers,
      followupMessages: messages,
      extractedSlots: slots,
    },
    hardConstraints: {
      mobilityLimit:
        mobilityText.includes("제약") ||
        mobilityText.includes("적게") ||
        mobilityText.includes("힘들"),
      dietaryRestrictions: [],
      maxTransitPreference:
        transportText || paceText.includes("여유")
          ? transportText || "긴 이동 최소화 선호"
          : null,
    },
    softPreferences: {
      pace: slots.pacePreference ?? null,
      foodFocus: slots.foodImportance ?? null,
      restFocus: slots.restPriority ?? null,
      routeEfficiency:
        transportText.includes("택시") || transportText.includes("효율")
          ? "효율 중시"
          : transportText.includes("도보")
          ? "도보 친화"
          : null,
    },
    context: {
      specialGoal: slots.specialGoal ?? null,
      emotionalContext: emotionalText,
      companionDynamic: null,
    },
  };
}

function buildPrompt(params: {
  seed: FollowupSeed;
  messages: ChatMessage[];
  slots: ExtractedSlots;
}) {
  const { seed, messages, slots } = params;

  return `
You are converting a follow-up travel interview into a stable planning JSON.

Rules:
- Language for values: Korean
- Be conservative
- Do not invent specific facts
- Unknown => null or []
- Return JSON only
- Do not wrap with markdown

Return format:
{
  "hardConstraints": {
    "mobilityLimit": true,
    "dietaryRestrictions": ["string"],
    "maxTransitPreference": "string | null"
  },
  "softPreferences": {
    "pace": "string | null",
    "foodFocus": "string | null",
    "restFocus": "string | null",
    "routeEfficiency": "string | null"
  },
  "context": {
    "specialGoal": "string | null",
    "emotionalContext": "string | null",
    "companionDynamic": "string | null"
  }
}

Seed:
${JSON.stringify({
  source: seed.source,
  createdAt: seed.createdAt,
  summary: seed.summary,
  rawAnswers: seed.rawAnswers,
})}

Extracted slots:
${JSON.stringify(slots)}

Messages:
${JSON.stringify(messages)}
`;
}

function cleanFollowupContext(params: {
  seed: FollowupSeed;
  messages: ChatMessage[];
  slots: ExtractedSlots;
  input: unknown;
}): FollowupContext | null {
  const { seed, messages, slots, input } = params;
  if (!input || typeof input !== "object") return null;

  const obj = input as {
    hardConstraints?: Record<string, unknown>;
    softPreferences?: Record<string, unknown>;
    context?: Record<string, unknown>;
  };

  const hc = obj.hardConstraints ?? {};
  const sp = obj.softPreferences ?? {};
  const ctx = obj.context ?? {};

  return {
    source: {
      seedSource: seed.source ?? "unknown",
      seedCreatedAt: seed.createdAt ?? new Date().toISOString(),
      finalizeSource: "openai",
    },
    raw: {
      surveySummary: seed.summary,
      surveyRawAnswers: seed.rawAnswers,
      followupMessages: messages,
      extractedSlots: slots,
    },
    hardConstraints: {
      mobilityLimit: Boolean(hc.mobilityLimit),
      dietaryRestrictions: Array.isArray(hc.dietaryRestrictions)
        ? hc.dietaryRestrictions.filter(
            (v): v is string => typeof v === "string" && v.trim().length > 0
          )
        : [],
      maxTransitPreference:
        typeof hc.maxTransitPreference === "string" &&
        hc.maxTransitPreference.trim().length > 0
          ? hc.maxTransitPreference
          : null,
    },
    softPreferences: {
      pace:
        typeof sp.pace === "string" && sp.pace.trim().length > 0
          ? sp.pace
          : null,
      foodFocus:
        typeof sp.foodFocus === "string" && sp.foodFocus.trim().length > 0
          ? sp.foodFocus
          : null,
      restFocus:
        typeof sp.restFocus === "string" && sp.restFocus.trim().length > 0
          ? sp.restFocus
          : null,
      routeEfficiency:
        typeof sp.routeEfficiency === "string" &&
        sp.routeEfficiency.trim().length > 0
          ? sp.routeEfficiency
          : null,
    },
    context: {
      specialGoal:
        typeof ctx.specialGoal === "string" && ctx.specialGoal.trim().length > 0
          ? ctx.specialGoal
          : null,
      emotionalContext:
        typeof ctx.emotionalContext === "string" &&
        ctx.emotionalContext.trim().length > 0
          ? ctx.emotionalContext
          : null,
      companionDynamic:
        typeof ctx.companionDynamic === "string" &&
        ctx.companionDynamic.trim().length > 0
          ? ctx.companionDynamic
          : null,
    },
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const seed = (body?.seed ?? null) as FollowupSeed;
    const messages: ChatMessage[] = Array.isArray(body?.messages)
      ? (body.messages as ChatMessage[])
      : [];

    const slots = normalizeSlots(body?.extractedSlots);

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You convert travel follow-up chat into stable planning JSON. Return strict JSON only.",
          },
          {
            role: "user",
            content: buildPrompt({ seed, messages, slots }),
          },
        ],
      });

      const text = response.choices?.[0]?.message?.content;
      if (!text) throw new Error("empty_openai_response");

      const parsed = JSON.parse(text);
      const planningInput = cleanFollowupContext({
        seed,
        messages,
        slots,
        input: parsed,
      });

      if (!planningInput) {
        throw new Error("invalid_planning_input");
      }

      const result: FinalizeChatResponse = {
        source: "openai",
        planningInput,
      };

      return Response.json(result);
    } catch (error) {
      console.error("followup-chat/finalize openai error", error);

      const fallback: FinalizeChatResponse = {
        source: "rule_based_fallback",
        planningInput: ruleBasedFollowupContext({ seed, messages, slots }),
        error: "openai_finalize_failed",
      };

      return Response.json(fallback);
    }
  } catch (error) {
    console.error("followup-chat/finalize error", error);

    const seed: FollowupSeed = {
      source: "unknown",
      createdAt: new Date().toISOString(),
      summary: null,
      rawAnswers: null,
    };

    const fallback: FinalizeChatResponse = {
      source: "rule_based_fallback",
      planningInput: ruleBasedFollowupContext({
        seed,
        messages: [],
        slots: {},
      }),
      error: "request_parse_failed",
    };

    return Response.json(fallback);
  }
}
