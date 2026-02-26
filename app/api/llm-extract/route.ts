import { NextResponse } from "next/server";
import OpenAI from "openai";

function hasRealKey(k?: string | null) {
  if (!k) return false;
  if (k.includes("여기에키넣으면됨")) return false;
  if (k.trim().length < 20) return false;
  return true;
}

export async function POST(req: Request) {
  const payload = await req.json();

  const key = process.env.OPENAI_API_KEY;
  if (!hasRealKey(key)) {
    // Mock extraction (스키마 M 형태)
    return NextResponse.json({
      extraction: {
        context_tags: [],
        success_moments: payload?.assist?.successMoments ? [payload.assist.successMoments] : [],
        risks: (payload?.assist?.worries || []).concat(payload?.assist?.worriesEtc ? [payload.assist.worriesEtc] : []),
        hard_constraints: {
          max_wait_minutes: payload?.trip?.maxWait === "상관없음" ? 60 : Number(payload?.trip?.maxWait || 20),
          no_early_morning: (payload?.assist?.hardNo || []).includes("새벽 기상"),
          no_long_transfer: (payload?.assist?.hardNo || []).includes("환승 많음"),
        },
        soft_preferences: {
          mood: payload?.assist?.mood || [],
          pace: payload?.trip?.density === "여유" ? "light" : payload?.trip?.density === "빡빡" ? "dense" : "moderate",
          focus: [payload?.trip?.goal].filter(Boolean),
        },
        user_summary_sentence: payload?.assist?.specialMeaning
          ? `이번 여행은 "${payload.assist.specialMeaning}" 맥락이 있으므로 회피 조건을 우선합니다.`
          : "맥락 정보가 제한적이므로 설문 기반으로 보수적으로 설계합니다.",
      }
    });
  }

  const client = new OpenAI({ apiKey: key });

  // Structured Outputs를 쓰고 싶으면 여기서 response_format JSON schema를 더 엄격히 지정하면 됨.
  // MVP-0에서는 “JSON 형태”만 강제하고, 서버에서 shape를 간단히 검증하는 방식으로 둔다.
  const system = `
너는 여행 설계 시스템의 추출기다.
입력은 (1차 성향 결과, 2차 여행 조건, 앵커, 보조질문)이다.
출력은 반드시 JSON만.
필드:
- context_tags: string[]
- success_moments: string[]
- risks: string[]
- hard_constraints: { no_early_morning?: boolean, max_wait_minutes?: number, no_long_transfer?: boolean }
- soft_preferences: { mood?: string[], pace?: "light"|"moderate"|"dense", focus?: string[] }
- user_summary_sentence: string
`;

  const user = `입력 데이터:\n${JSON.stringify(payload)}`;

  const resp = await client.responses.create({
    model: "gpt-4o-mini",
    input: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  // 응답 텍스트 취득
  const text = resp.output_text?.trim() || "";

  // JSON 파싱(실패 시 안전 mock)
  try {
    const extraction = JSON.parse(text);
    return NextResponse.json({ extraction });
  } catch {
    return NextResponse.json({
      extraction: {
        context_tags: [],
        success_moments: [],
        risks: [],
        hard_constraints: {},
        soft_preferences: {},
        user_summary_sentence: "LLM 응답을 JSON으로 파싱하지 못했습니다.",
      }
    });
  }
}
