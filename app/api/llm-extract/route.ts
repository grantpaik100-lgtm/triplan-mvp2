import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const payload = await req.json();

  // 키를 나중에 넣을 거라서, 지금은 mock extraction만 반환
  // (스키마 M 형태 유지)
  const maxWaitRaw = payload?.trip?.maxWait;
  const maxWaitMinutes =
    maxWaitRaw === "상관없음" ? 60 : Number(maxWaitRaw || 20);

  const hardNo: string[] = payload?.assist?.hardNo || [];
  const worries: string[] = payload?.assist?.worries || [];
  const worriesEtc: string = payload?.assist?.worriesEtc || "";
  const successMomentsRaw: string = payload?.assist?.successMoments || "";

  return NextResponse.json({
    extraction: {
      context_tags: [],
      success_moments: successMomentsRaw ? [successMomentsRaw] : [],
      risks: worries.concat(worriesEtc ? [worriesEtc] : []),
      hard_constraints: {
        max_wait_minutes: maxWaitMinutes,
        no_early_morning: hardNo.includes("새벽 기상"),
        no_long_transfer: hardNo.includes("환승 많음"),
      },
      soft_preferences: {
        mood: payload?.assist?.mood || [],
        pace:
          payload?.trip?.density === "여유"
            ? "light"
            : payload?.trip?.density === "빡빡"
              ? "dense"
              : "moderate",
        focus: [payload?.trip?.goal].filter(Boolean),
      },
      user_summary_sentence: payload?.assist?.specialMeaning
        ? `이번 여행은 "${payload.assist.specialMeaning}" 맥락이 있으므로 회피 조건을 우선합니다.`
        : "맥락 정보가 제한적이므로 설문 기반으로 보수적으로 설계합니다.",
    },
  });
}
