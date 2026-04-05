/**
 * TriPlan V3
 * Current Role:
 * - followup conversation 시작 시 초기 질문/slot state를 생성하는 API endpoint다.
 *
 * Target Role:
 * - followup-chat chain의 공식 start endpoint로 유지되어야 한다.
 *
 * Chain:
 * - followup
 *
 * Inputs:
 * - followup seed
 * - optional context
 *
 * Outputs:
 * - first assistant message
 * - slot/question state
 *
 * Called From:
 * - app/followup/FollowupMiniApp.tsx
 *
 * Side Effects:
 * - external model call 가능
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
 * - old followup API와 혼동하지 말 것.
 */
import OpenAI from "openai";
import type {
  ExtractedSlots,
  FollowupSeed,
  StartChatResponse,
} from "@/types/followupChat";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

function buildPrompt(seed: FollowupSeed | null) {
  return `
You are the follow-up interviewer for TriPlan, a travel planning service.

Your job:
1. Read the survey summary and raw answers.
2. Decide what the most important missing information is.
3. Write the very first assistant message in Korean.
4. The message should:
   - briefly acknowledge that you read the survey
   - say the user can ask questions during the conversation
   - ask exactly one natural first question
5. Do not sound like a rigid form.
6. Keep it concise and natural.
7. Return JSON only.

Return format:
{
  "assistantMessage": "string"
}

Survey seed:
${JSON.stringify(seed)}
`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const seed = (body?.seed ?? null) as FollowupSeed | null;

    const initialSlots: ExtractedSlots = {};

    if (!seed) {
      const fallback: StartChatResponse = {
        assistantMessage:
          "일정 설계를 위해 몇 가지만 더 확인할게요. 중간에 궁금한 점이 있으면 바로 물어봐도 됩니다. 우선 이번 여행에서 가장 중요하게 생각하는 건 무엇인가요?",
        extractedSlots: initialSlots,
        missingSlots: getMissingSlots(initialSlots),
        turnCount: 0,
      };

      return Response.json(fallback);
    }

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-mini",
        temperature: 0.4,
        messages: [
          {
            role: "system",
            content:
              "You are a Korean travel follow-up interviewer. Return strict JSON only.",
          },
          {
            role: "user",
            content: buildPrompt(seed),
          },
        ],
      });

      const text = response.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error("empty_openai_response");
      }

      const parsed = JSON.parse(text) as {
        assistantMessage?: unknown;
      };

      const assistantMessage =
        typeof parsed.assistantMessage === "string" &&
        parsed.assistantMessage.trim().length > 0
          ? parsed.assistantMessage
          : "설문 답변은 확인했어요. 일정 설계를 위해 핵심만 몇 가지 더 여쭤볼게요. 중간에 궁금한 점이 있으면 바로 물어봐도 됩니다. 우선 이번 여행에서 가장 중요하게 생각하는 건 무엇인가요?";

      const result: StartChatResponse = {
        assistantMessage,
        extractedSlots: initialSlots,
        missingSlots: getMissingSlots(initialSlots),
        turnCount: 0,
      };

      return Response.json(result);
    } catch (error) {
      console.error("followup-chat/start openai error", error);

      const fallback: StartChatResponse = {
        assistantMessage:
          "설문 답변은 확인했어요. 일정 설계를 위해 핵심만 몇 가지 더 여쭤볼게요. 중간에 궁금한 점이 있으면 바로 물어봐도 됩니다. 우선 이번 여행에서 가장 중요하게 생각하는 건 무엇인가요?",
        extractedSlots: initialSlots,
        missingSlots: getMissingSlots(initialSlots),
        turnCount: 0,
      };

      return Response.json(fallback);
    }
  } catch (error) {
    console.error("followup-chat/start error", error);

    const fallback: StartChatResponse = {
      assistantMessage:
        "일정 설계를 위해 몇 가지만 더 확인할게요. 우선 이번 여행에서 가장 중요하게 생각하는 건 무엇인가요?",
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
      turnCount: 0,
    };

    return Response.json(fallback);
  }
}
