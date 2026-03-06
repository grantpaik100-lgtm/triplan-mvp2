import OpenAI from "openai";

type FollowupQuestion = {
  id: string;
  question: string;
  type: "shortText" | "single";
  options?: string[];
};

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
      question:
        "이번 여행에서 음식 경험은 어느 정도 중요한가요?",
      type: "single",
      options: [
        "매우 중요하다",
        "어느 정도 중요하다",
        "그렇게 중요하지 않다",
      ],
    },
    {
      id: "special_goal",
      question:
        "이번 여행에서 꼭 하고 싶은 것이 있다면 짧게 적어주세요.",
      type: "shortText",
    },
  ];
}

function cleanQuestions(input: any): FollowupQuestion[] {
  if (!Array.isArray(input)) return [];

  const result: FollowupQuestion[] = [];

  for (const q of input) {
    if (!q) continue;

    if (
      typeof q.id !== "string" ||
      typeof q.question !== "string" ||
      typeof q.type !== "string"
    ) {
      continue;
    }

    if (q.type === "single") {
      if (!Array.isArray(q.options) || q.options.length < 2) continue;
    }

    result.push({
      id: q.id,
      question: q.question,
      type: q.type,
      options: q.options,
    });
  }

  return result.slice(0, 3);
}

function buildPrompt(summary: unknown) {
  return `
You are helping a travel planning service.

Based on the following survey summary,
generate 2 or 3 follow-up questions that help clarify important information
for itinerary generation.

Rules:

- maximum 3 questions
- minimum 2 questions
- Korean language
- short and clear
- types must be "shortText" or "single"
- if type is single, provide 2-5 options

Return JSON only.

Format:

{
 "questions":[
   {
     "id":"string",
     "question":"string",
     "type":"shortText | single",
     "options":["string"]
   }
 ]
}

Summary:
${JSON.stringify(summary)}
`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const seedSummary = body?.seedSummary;

    if (!seedSummary) {
      return Response.json({ questions: fallbackQuestions() });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "You generate travel follow-up questions and return JSON only.",
        },
        {
          role: "user",
          content: buildPrompt(seedSummary),
        },
      ],
    });

    const text = response.choices?.[0]?.message?.content;

    if (!text) {
      return Response.json({ questions: fallbackQuestions() });
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      return Response.json({ questions: fallbackQuestions() });
    }

    const cleaned = cleanQuestions(parsed.questions);

    if (cleaned.length < 2) {
      return Response.json({ questions: fallbackQuestions() });
    }

    return Response.json({
      questions: cleaned,
    });
  } catch (err) {
    console.error("followup error", err);

    return Response.json({
      questions: fallbackQuestions(),
    });
  }
}
