import OpenAI from "openai";
import { type FollowupQuestion, type FollowupQuestionsResponse } from "@/types/tripPlanning";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function fallbackQuestions(): FollowupQuestion[] {
  return [
    {
      id: "pace",
      question:
        "여유로운 일정을 원한다고 했는데, 장소 수를 줄이는 것이 더 중요한가요 아니면 휴식을 많이 넣는 것이 중요한가요?",
      type: "single",
      options: [
        "장소 수를 줄이고 싶다",
        "휴식을 많이 넣고 싶다",
        "둘 다 중요하다",
      ],
    },
    {
      id: "food_importance",
      question: "이번 여행에서 음식 경험은 어느 정도 중요한가요?",
      type: "single",
      options: [
        "매우 중요하다",
        "어느 정도 중요하다",
        "그렇게 중요하지 않다",
      ],
    },
    {
      id: "special_goal",
      question: "이번 여행에서 꼭 하고 싶은 것이 있다면 짧게 적어주세요.",
      type: "shortText",
    },
  ];
}

function cleanQuestions(input: unknown): FollowupQuestion[] {
  if (!Array.isArray(input)) return [];

  const result: FollowupQuestion[] = [];

  for (const q of input) {
    if (!q || typeof q !== "object") continue;

    const item = q as {
      id?: unknown;
      question?: unknown;
      type?: unknown;
      options?: unknown;
    };

    if (
      typeof item.id !== "string" ||
      typeof item.question !== "string" ||
      (item.type !== "shortText" && item.type !== "single")
    ) {
      continue;
    }

    if (item.type === "single") {
      if (
        !Array.isArray(item.options) ||
        item.options.length < 2 ||
        item.options.some((v) => typeof v !== "string")
      ) {
        continue;
      }
    }

    result.push({
      id: item.id,
      question: item.question,
      type: item.type,
      options: item.type === "single" ? (item.options as string[]) : undefined,
    });
  }

  return result.slice(0, 3);
}

function buildPrompt(summary: unknown) {
  return `
You are helping a travel planning service called TriPlan.

Your job is to generate 2 or 3 follow-up questions
that clarify only the most important missing information
for itinerary generation.

Rules:
- return 2 or 3 questions only
- language: Korean
- concise, natural, clear
- avoid repeating information already obvious in the summary
- ask only high-value questions
- question type must be either "shortText" or "single"
- if type is "single", provide 2 to 5 options
- IDs should be short snake_case strings
- return JSON only
- do not wrap JSON in markdown

Format:
{
  "questions": [
    {
      "id": "string",
      "question": "string",
      "type": "shortText" | "single",
      "options": ["string"]
    }
  ]
}

Survey summary:
${JSON.stringify(summary)}
`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const seedSummary = body?.seedSummary;

    if (!seedSummary) {
      const fallback: FollowupQuestionsResponse = {
        source: "fallback",
        questions: fallbackQuestions(),
        error: "missing_seed_summary",
      };
      return Response.json(fallback);
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You generate follow-up questions for travel planning and return strict JSON only.",
        },
        {
          role: "user",
          content: buildPrompt(seedSummary),
        },
      ],
    });

    const text = response.choices?.[0]?.message?.content;

    if (!text) {
      const fallback: FollowupQuestionsResponse = {
        source: "fallback",
        questions: fallbackQuestions(),
        error: "empty_openai_response",
      };
      return Response.json(fallback);
    }

    let parsed: unknown;

    try {
      parsed = JSON.parse(text);
    } catch {
      const fallback: FollowupQuestionsResponse = {
        source: "fallback",
        questions: fallbackQuestions(),
        error: "json_parse_failed",
      };
      return Response.json(fallback);
    }

    const parsedObj =
      parsed && typeof parsed === "object"
        ? (parsed as { questions?: unknown })
        : null;

    const cleaned = cleanQuestions(parsedObj?.questions);

    if (cleaned.length < 2) {
      const fallback: FollowupQuestionsResponse = {
        source: "fallback",
        questions: fallbackQuestions(),
        error: "insufficient_questions",
      };
      return Response.json(fallback);
    }

    const result: FollowupQuestionsResponse = {
      source: "openai",
      questions: cleaned,
    };

    return Response.json(result);
  } catch (error) {
    console.error("followup-questions error", error);

    const fallback: FollowupQuestionsResponse = {
      source: "fallback",
      questions: fallbackQuestions(),
      error: "openai_request_failed",
    };

    return Response.json(fallback);
  }
}
