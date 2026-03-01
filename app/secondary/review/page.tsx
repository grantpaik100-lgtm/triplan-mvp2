import { NextResponse } from "next/server";

type ReqBody = {
  message: string;
  answers: Record<string, any>;
  history?: Array<{ role: "user" | "assistant"; text: string }>;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ReqBody;
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: "missing_OPENAI_API_KEY" }, { status: 500 });
    }

    const userMsg = (body.message || "").trim();
    if (!userMsg) {
      return NextResponse.json({ error: "empty_message" }, { status: 400 });
    }

    const instructions =
      "너는 TriPlan의 여행 설계 보조(컨설턴트)다. 사용자가 입력한 설정값(제약/리스크/우선순위)을 기반으로, 일정 설계에 미치는 영향과 트레이드오프만 짧게 설명한다. 과장/감정/칭찬 없이, 1) 영향 2) 리스크 3) 확인 질문(필요한 경우만) 순서로 답한다.";

    const input = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "설문2 설정값(JSON):\n" +
              JSON.stringify(body.answers ?? {}, null, 2) +
              "\n\n사용자 질문:\n" +
              userMsg,
          },
        ],
      },
    ];

    // OpenAI Responses API
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5",
        instructions,
        input,
      }),
    });

    const json = await r.json();
    if (!r.ok) {
      return NextResponse.json({ error: "openai_error", detail: json }, { status: 500 });
    }

    // responses: output_text is convenient but not always present depending on config
    const text =
      (json && (json.output_text as string)) ||
      extractOutputText(json) ||
      "응답 파싱 실패";

    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

function extractOutputText(resp: any): string | null {
  try {
    const out = resp?.output;
    if (!Array.isArray(out)) return null;
    for (const item of out) {
      // common shape: { type:"message", content:[{type:"output_text",text:"..."}]}
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const c of content) {
        if (c?.type === "output_text" && typeof c?.text === "string") return c.text;
        if (c?.type === "text" && typeof c?.text === "string") return c.text;
      }
    }
    return null;
  } catch {
    return null;
  }
}
}
