import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function POST(req: Request) {
  const body = await req.json();
  const seedSummary = body.seedSummary;

  const prompt = `
You are generating follow-up questions for travel planning.

Based on the following summary,
create 2 or 3 questions to clarify missing information.

Return JSON only.

Summary:
${JSON.stringify(seedSummary)}
`;

  const completion = await client.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: "You generate followup travel questions." },
      { role: "user", content: prompt }
    ],
    response_format: { type: "json_object" }
  });

  const result = completion.choices[0].message.content;

  return Response.json(JSON.parse(result!));
}
