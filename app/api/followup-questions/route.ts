import OpenAI from "openai";

type FollowupQuestion = {
  id: string;
  question: string;
  type: "shortText" | "single";
  options?: string[];
};

type FollowupQuestionsResponse = {
  questions: FollowupQuestion[];
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function normalizeQuestions(input: unknown): FollowupQuestion[] {
  if (!Array.isArray(input)) return [];

  const result: FollowupQuestion[] = [];

  for (const item of input) {
    if (!item || typeof item !== "object") continue;

    const q = item as Record<string, unknown>;
    const id = typeof q.id === "string" && q.id.trim() ? q.id.trim() : "";
    const question =
      typeof q.question === "string" && q.question.trim()
        ? q.question.trim()
        : "";
    const type =
      q.type === "shortText" || q.type === "single" ? q.type : null;

    if (!id || !question || !type) continue;

    const normalized: FollowupQuestion = {
      id,
      question,
      type,
    };

    if (type === "single") {
      const options = Array.isArray(q.options)
        ? q.options
            .filter((v): v is string => typeof v === "string")
            .map((v) => v.trim())
            .filter(Boolean)
            .slice(0, 6)
        : [];

      if (options.length < 2) continue;
      normalized.options = options;
    }

    result.push(normalized);
  }

  return result.slice(0, 3);
}

function fallbackQuestions(): FollowupQuestion[] {
  return [
    {
      id: "pace_clarify",
      question:
        "여유로운 일정을 원한다고 했는데, 장소 수를 줄이는 것이 더 중요한가요 아니면 중간 휴식을 충분히 넣는 것이 더 중요한가요?",
      type: "single",
      options: [
        "장소 수를 줄이고 싶어요",
        "중간 휴식을 많이 넣고 싶어요",
        "둘 다 중요해요",
      ],
    },
    {
      id: "must_visit_reason",
      question:
        "꼭 가고 싶은 장소가 있다면, 그 장소가 중요한 이유를 짧게 적어주세요.",
      type: "shortText",
    },
    {
      id: "meal_priority",
      question:
        "이번 여행에서 음식은 어떤 의미에 더 가까운가요?",
      type: "single",
      options: [
        "유명한 맛집 경험이 중요해요",
        "분위기 좋은 식사가 중요해요",
        "간편하고 효율적인 식사가 좋아요",
        "상황에 따라 유동적이에요",
      ],
    },
  ];
}

function buildPrompt(seedSummary: unknown) {
  return `
You are helping a travel-planning app create follow-up questions after two prior surveys.

Goal:
Ask only 2 or 3 additional questions that are truly necessary for itinerary generation.

Criteria:
1. Focus on ambiguous or missing information.
2. Focus on information that meaningfully changes itinerary design.
3. Do NOT ask broad or repetitive questions already likely covered by earlier surveys.
4. Keep questions easy to answer within 1-2 minutes total.
5. Prefer either:
   - shortText
   - single
6. For "single", provide 2 to 5 concise options.
7. Questions must be natural Korean.
8. Return JSON only.

Response JSON schema:
{
  "questions": [
    {
      "id": "string",
      "question": "string",
      "type": "shortText" | "single",
      "options": ["string", "string"]
    }
  ]
}

Important:
- Maximum 3 questions.
- Minimum 2 questions.
- Make each question specific and decision-relevant.
- Avoid vague questions like "Tell us more about your trip."
- If information already seems sufficient, still choose the 2 most valuable clarifying questions.

Seed summary:
${JSON.stringify(seedSummary, null, 2)}
`.trim();
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "OPENAI_API_KEY is not configured." },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => null);
    const seedSummary = body?.seedSummary;

    if (!seedSummary) {
      return Response.json(
        { error: "seedSummary is required." },
        { status: 400 }
      );
    }

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You generate high-quality follow-up questions for itinerary planning and must return strict JSON only.",
        },
        {
          role: "user",
          content: buildPrompt(seedSummary),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "followup_questions",
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              questions: {
                type: "array",
                minItems: 2,
                maxItems: 3,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string" },
                    question: { type: "string" },
                    type: {
                      type: "string",
                      enum: ["shortText", "single"],
                    },
                    options: {
                      type: "array",
                      items: { type: "string" },
                    },
                  },
                  required: ["id", "question", "type"],
                },
              },
            },
            required: ["questions"],
          },
        },
      },
    });

    const rawText = response.output_text;
    const parsed = JSON.parse(rawText) as FollowupQuestionsResponse;
    const questions = normalizeQuestions(parsed.questions);

    if (questions.length < 2) {
      return Response.json(
        { questions: fallbackQuestions() satisfies FollowupQuestion[] },
        { status: 200 }
      );
    }

    return Response.json({ questions } satisfies FollowupQuestionsResponse, {
      status: 200,
    });
  } catch (error) {
    console.error("[/api/followup-questions] error:", error);

    return Response.json(
      { questions: fallbackQuestions() satisfies FollowupQuestion[] },
      { status: 200 }
    );
  }
}
