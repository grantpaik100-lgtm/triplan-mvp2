import type { ExtractedSlots, StartChatResponse } from "@/types/followupChat";

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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const seedSummary = body?.seedSummary;

    const initialSlots: ExtractedSlots = {};

    const assistantMessage = seedSummary
      ? "지금까지 답변을 바탕으로 일정 설계에 필요한 핵심만 몇 가지 더 확인할게요. 중간에 궁금한 점이 있으면 바로 물어봐도 됩니다. 우선 이번 여행에서 가장 중요하게 생각하는 건 무엇인가요?"
      : "일정 설계를 위해 몇 가지만 더 확인할게요. 중간에 궁금한 점이 있으면 바로 물어봐도 됩니다. 우선 이번 여행에서 가장 중요하게 생각하는 건 무엇인가요?";

    const result: StartChatResponse = {
      assistantMessage,
      extractedSlots: initialSlots,
      missingSlots: getMissingSlots(initialSlots),
      turnCount: 0,
    };

    return Response.json(result);
  } catch (error) {
    console.error("followup-chat/start error", error);

    const fallback: StartChatResponse = {
      assistantMessage:
        "일정 설계를 위해 몇 가지만 더 확인할게요. 이번 여행에서 가장 중요하게 생각하는 건 무엇인가요?",
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
