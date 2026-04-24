/**
 * TriPlan V3
 * Current Role:
 * - Secondary/followup 계층의 입력을 engine이 이해하는 PlanningInput으로 정규화하는 변환 파일이다.
 *
 * Target Role:
 * - user-facing inputs -> engine-facing PlanningInput 변환의 공식 adapter로 유지되어야 한다.
 *
 * Chain:
 * - engine
 *
 * Inputs:
 * - secondaryAnswers 또는 equivalent survey-derived input
 *
 * Outputs:
 * - PlanningInput
 *
 * Called From:
 * - app/api/generate-trip/route.ts
 * - followup/fallback conversion paths
 *
 * Side Effects:
 * - 없음
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
 * - duplicate file(normalizeInput (1).ts)와 혼동 금지.
 */

import type { CompanionType, DiversityMode, PlanningInput } from "./types";

type SecondaryAnswers = Record<string, any>;

function mapCompanionType(value?: string): CompanionType {
  switch (value) {
    case "혼자":
    case "solo":
      return "solo";

    case "연인":
    case "커플":
    case "couple":
      return "couple";

    case "가족":
    case "부모님":
    case "family":
      return "family";

    case "친구":
    case "친구들":
    case "friends":
    default:
      return "friends";
  }
}

function mapStartSlot(value?: string): number {
  switch (value) {
    case "09시 이전":
      return 18; // 09:00
    case "09~11시":
      return 20; // 10:00
    case "11~14시":
      return 24; // 12:00
    case "14시 이후":
      return 30; // 15:00
    default:
      return 20;
  }
}

function mapEndSlot(value?: string): number {
  switch (value) {
    case "12시 이전":
      return 24; // 12:00
    case "12~15시":
      return 30; // 15:00
    case "15~18시":
      return 36; // 18:00
    case "18시 이후":
      return 44; // 22:00
    default:
      return 44;
  }
}

function mapDensity(value?: string): 1 | 2 | 3 | 4 | 5 {
  switch (value) {
    case "여유롭게 (1~2곳)":
      return 1;
    case "적당히 (3~4곳)":
      return 3;
    case "밀도 있게 (5~6곳)":
      return 5;
    default:
      return 3;
  }
}

function mapDiversityMode(value?: string): DiversityMode {
  switch (value) {
    case "다양하게 섞인 여행":
      return "diverse";

    case "한 컨셉에 집중한 여행":
      return "theme_focused";

    case "적당히 균형 잡힌 여행":
    case "잘 모르겠음":
    case "기타":
    default:
      return "balanced";
  }
}

function mapChronotype(
  value?: string,
): "morning" | "neutral" | "night" | undefined {
  switch (value) {
    case "아침형":
    case "morning":
      return "morning";
    case "저녁형":
    case "night":
      return "night";
    case "중간형":
    case "neutral":
    default:
      return "neutral";
  }
}

function mapRestPolicy(
  value?: string,
): "frequent" | "normal" | "minimal" | undefined {
  switch (value) {
    case "자주 쉬어가는 편":
    case "frequent":
      return "frequent";
    case "거의 쉬지 않는 편":
    case "minimal":
      return "minimal";
    default:
      return "normal";
  }
}

function mapNightActive(value?: string): boolean | undefined {
  if (!value) return undefined;
  return value.includes("야간") || value.includes("밤") || value === "active";
}

function mapCrowdSensitivity(
  value?: string,
): "low" | "mid" | "high" | undefined {
  switch (value) {
    case "사람 많아도 괜찮음":
    case "low":
      return "low";
    case "사람 많으면 별로":
    case "high":
      return "high";
    default:
      return "mid";
  }
}

function mapBudgetTier(
  value?: string,
): "tight" | "normal" | "premium" | undefined {
  switch (value) {
    case "절약":
    case "tight":
      return "tight";
    case "프리미엄":
    case "premium":
      return "premium";
    default:
      return "normal";
  }
}

export function normalizePlanningInput(
  secondary: SecondaryAnswers,
): PlanningInput {
  const diversityRaw =
    secondary.diversityMode === "기타"
      ? secondary.diversityModeOther
      : secondary.diversityMode;

  const mustPlaceNames: string[] = Array.isArray(secondary.mustPlaces)
    ? secondary.mustPlaces
        .map((p: { name?: string }) => p?.name)
        .filter(
          (n): n is string => typeof n === "string" && n.trim().length > 0,
        )
    : [];

  return {
    days: Number(secondary.tripDays) || 1,
    companionType: mapCompanionType(secondary.companionType),
    dailyStartSlot: mapStartSlot(secondary.firstDayStart),
    dailyEndSlot: mapEndSlot(secondary.lastDayEnd),
    dailyDensity: mapDensity(secondary.pace),
    diversityMode: mapDiversityMode(diversityRaw),
    mustExperienceIds: [],
    preferredAreas: [],
    blockedAreas: [],

    chronotype: mapChronotype(secondary.chronotype),
    restPolicy: mapRestPolicy(secondary.restFrequency),
    nightActive: mapNightActive(secondary.nightPreference),
    crowdSensitivity: mapCrowdSensitivity(secondary.crowdTolerance),
    budgetTier: mapBudgetTier(secondary.budgetLevel),
    emotionalContext: secondary.atmospherePreference ?? null,
    mustPlaceNames: mustPlaceNames.length > 0 ? mustPlaceNames : undefined,
  };
}
