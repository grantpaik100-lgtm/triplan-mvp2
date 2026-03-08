import OpenAI from "openai";
import type {
  ChatMessage,
  ExtractedSlots,
  TurnChatResponse,
} from "@/types/followupChat";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_TURNS = 6;

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

function mergeSlots(prev: ExtractedSlots, next: ExtractedSlots): ExtractedSlots {
  return {
    pacePreference: next.pacePreference ?? prev.pacePreference ?? null,
    restPriority: next.restPriority ?? prev.restPriority ?? null,
    foodImportance: next.foodImportance ?? prev.foodImportance ?? null,
    waitingTolerance: next.waitingTolerance ?? prev.waitingTolerance ?? null,
    mobilityConstraint: next.mobilityConstraint ?? prev.mobilityConstraint ?? null,
    transportPreference: next.transportPreference ?? prev.transportPreference ?? null,
    specialGoal: next.specialGoal ?? prev.specialGoal ?? null,
    emotionalContext: next.emotionalContext ?? prev.emotionalContext ?? null,
  };
}

function getMissingSlots(slots: ExtractedSlots): string[] {
  const keys: (keyof ExtractedSlots)[] = [
    "pacePreference",
    "restPriority",
    "foodImportance",
    "waitingTolerance",
    "mobilityConstraint",
    "transportPreference",
    "specialGoal",
    "emotionalContext",
  ];

  return keys.filter((key) => {
    const value = slots[key];
    return !value || String(value).trim().length === 0;
  }) as string[];
}

function shouldFinalizeByRules(params: {
  turnCount: number;
  slots: ExtractedSlots;
  userMessage: string;
}): boolean {
  const { turnCount, slots, userMessage } = params;
  const lower = userMessage.toLowerCase();
  const filledCount = 8 - getMissingSlots(slots).length;

  if (
    lower.includes("이제 됐") ||
    lower.includes("충분") ||
    lower.includes("추천해") ||
    lower.includes("끝") ||
    lower.includes("그만")
  ) {
    return true;
  }

  if (filledCount >= 5 && turnCount >= 4) return true;
  if (turnCount >= MAX_TURNS) return true;

  return false;
}

function fallbackAssistantMessage(missingSlots: string[]): string {
  if (missingSlots.includes("foodImportance")) {
    return "좋아요. 이번 여행에서 음식 경험은 어느 정도 중요한가요?";
  }

  if (missingSlots.includes("waitingTolerance")) {
    return "맛집이나 인기 장소를 간다면 웨이팅은 어느 정도까지 괜찮을까요?";
  }

  if (missingSlots.includes("mobilityConstraint")) {
    return "걷는 양이나 이동 거리에서 특별히 피하고 싶은 기준이 있나요?";
  }

  if (missingSlots.includes("transportPreference")) {
    return "이동은 도보, 대중교통, 택시 중 어떤 방식을 더 선호하나요?";
  }

  if (missingSlots.includes("pacePreference")) {
    return "일정은 여유로운 편, 적당한 편, 빡빡한 편 중 어떤 쪽이 더 좋나요?";
  }

  if (missingSlots.includes("restPriority")) {
    return "이번 여행에서는 장소를 더 많이 보는 것과 쉬는 시간을 확보하는 것 중 무엇이 더 중요한가요?";
  }

  if (missingSlots.includes("specialGoal")) {
    return "이번 여행에서 꼭 이루고 싶은 목표가 있다면 한 문장으로 말해 주세요.";
  }

  if (missingSlots.includes("emotionalContext")) {
    return "이번 여행이 어떤 느낌으로 기억되면 좋겠는지도 말해 주세요.";
  }

  return "좋아요. 지금까지 내용으로도 어느 정도 기준이 잡혔어요. 이어서 일정 설계로 넘어갈까요?";
}

function buildPrompt(params: {
  seed: {
    source?: string;
    createdAt?: string;
    summary?: unknown;
    rawAnswers?: unknown;
  } | null;
  messages: ChatMessage[];
  currentSlots: ExtractedSlots;
  userMessage: string;
  turnCount: number;
}) {
  const { seed, messages, currentSlots, userMessage, turnCount } = params;

  return `
You are the follow-up chat interviewer for a travel planning service called TriPlan.

Your job:
1. Read the original survey summary and raw answers.
2. Read the conversation so far.
3. Update slot values conservatively.
4. If the user asked a direct question, answer it briefly first.
5. Then ask exactly one natural next question in Korean.
6. Ask only about information that is still important and unclear.
7. Do not sound like a rigid questionnaire.
8. Keep the tone calm, concise, helpful.
9. Return JSON only.

Important:
- You are not starting from scratch.
- You already know the survey context.
- Use the survey context to avoid asking redundant questions.
- Ask one short but high-value next question only.

Slots:
- pacePreference
- restPriority
- foodImportance
- waitingTolerance
- mobilityConstraint
- transportPreference
- specialGoal
- emotionalContext

Return format:
{
  "assistantMessage": "string",
  "extractedSlots": {
    "pacePreference": "string | null",
    "restPriority": "string | null",
    "foodImportance": "string | null",
    "waitingTolerance": "string | null",
    "mobilityConstraint": "string | null",
    "transportPreference": "string | null",
    "specialGoal": "string | null",
    "emotionalContext": "string | null"
  },
  "shouldFinalize": false
}

Current turnCount: ${turnCount}

Survey seed:
${JSON.stringify(seed)}

Current slots:
${JSON.stringify(currentSlots)}

Latest user message:
${JSON.stringify(userMessage)}

Conversation:
${JSON.stringify(messages)}
`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const seed = (body?.seed ?? null) as {
  source?: string;
  createdAt?: string;
  summary?: unknown;
  rawAnswers?: unknown;
} | null;

const messages = Array.isArray(body?.messages)
  ? (body.messages as ChatMessage[])
  : [];
const currentSlots = normalizeSlots(body?.extractedSlots);
const userMessage =
  typeof body?.userMessage === "string" ? body.userMessage : "";
const rawTurnCount =
  typeof body?.turnCount === "number" ? body.turnCount : 0;

    const nextTurnCount = rawTurnCount + 1;

    if (!userMessage.trim()) {
      const missingSlots = getMissingSlots(currentSlots);

      const result: TurnChatResponse = {
        assistantMessage: fallbackAssistantMessage(missingSlots),
        extractedSlots: currentSlots,
        missingSlots,
        turnCount: nextTurnCount,
        shouldFinalize: false,
      };

      return Response.json(result);
    }

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "You are a travel follow-up interviewer. Return strict JSON only.",
          },
          {
            role: "user",
            content: buildPrompt({
              seed,
              messages,
              currentSlots,
              userMessage,
              turnCount: nextTurnCount,
            }),
          },
        ],
      });

      const text = response.choices?.[0]?.message?.content;

      if (!text) {
        throw new Error("empty_openai_response");
      }

      const parsed = JSON.parse(text) as {
        assistantMessage?: unknown;
        extractedSlots?: unknown;
        shouldFinalize?: unknown;
      };

      const updatedSlots = mergeSlots(
        currentSlots,
        normalizeSlots(parsed.extractedSlots)
      );

      const missingSlots = getMissingSlots(updatedSlots);
      const assistantMessage =
        typeof parsed.assistantMessage === "string" &&
        parsed.assistantMessage.trim().length > 0
          ? parsed.assistantMessage
          : fallbackAssistantMessage(missingSlots);

      const llmFinalize = Boolean(parsed.shouldFinalize);
      const ruleFinalize = shouldFinalizeByRules({
        turnCount: nextTurnCount,
        slots: updatedSlots,
        userMessage,
      });

      const result: TurnChatResponse = {
        assistantMessage,
        extractedSlots: updatedSlots,
        missingSlots,
        turnCount: nextTurnCount,
        shouldFinalize: llmFinalize || ruleFinalize,
      };

      return Response.json(result);
    } catch (error) {
      console.error("followup-chat/turn openai error", error);

      const lower = userMessage.toLowerCase();
      const heuristicSlots = mergeSlots(currentSlots, {
        foodImportance:
          lower.includes("음식") || lower.includes("맛집")
            ? "중요"
            : currentSlots.foodImportance ?? null,
        pacePreference:
          lower.includes("여유") || lower.includes("느긋")
            ? "여유로운 일정 선호"
            : lower.includes("빡빡")
            ? "빡빡한 일정 가능"
            : currentSlots.pacePreference ?? null,
        restPriority:
          lower.includes("휴식") || lower.includes("쉬고")
            ? "휴식 중요"
            : currentSlots.restPriority ?? null,
        waitingTolerance:
          lower.includes("웨이팅") || lower.includes("줄")
            ? "웨이팅 관련 기준 언급"
            : currentSlots.waitingTolerance ?? null,
        mobilityConstraint:
          lower.includes("많이 걷") || lower.includes("걷는 건")
            ? "도보 이동 제약 가능성"
            : currentSlots.mobilityConstraint ?? null,
        transportPreference:
          lower.includes("택시")
            ? "택시 선호"
            : lower.includes("대중교통")
            ? "대중교통 선호"
            : lower.includes("도보")
            ? "도보 선호"
            : currentSlots.transportPreference ?? null,
        specialGoal:
          lower.includes("꼭")
            ? userMessage
            : currentSlots.specialGoal ?? null,
        emotionalContext:
          lower.includes("부모님") ||
          lower.includes("첫") ||
          lower.includes("기념")
            ? userMessage
            : currentSlots.emotionalContext ?? null,
      });

      const missingSlots = getMissingSlots(heuristicSlots);
      const result: TurnChatResponse = {
        assistantMessage: fallbackAssistantMessage(missingSlots),
        extractedSlots: heuristicSlots,
        missingSlots,
        turnCount: nextTurnCount,
        shouldFinalize: shouldFinalizeByRules({
          turnCount: nextTurnCount,
          slots: heuristicSlots,
          userMessage,
        }),
      };

      return Response.json(result);
    }
  } catch (error) {
    console.error("followup-chat/turn error", error);

    const fallback: TurnChatResponse = {
      assistantMessage:
        "좋아요. 이어서 한 가지만 더 여쭤볼게요. 이번 여행에서 가장 중요하게 생각하는 기준을 조금만 더 구체적으로 말해 주세요.",
      extractedSlots: {},
      missingSlots: [
        "pacePreference",
        "restPriority",
        "foodImportance",
        "waitingTolerance",
        "mobilityConstraint",
        "transportPreference",
        "specialGoal",
        "emotionalContext",
      ],
      turnCount: 1,
      shouldFinalize: false,
    };

    return Response.json(fallback);
  }
}
