import type { CompanionType, PlanningInput } from "./types";

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

export function normalizePlanningInput(
  secondary: SecondaryAnswers,
): PlanningInput {
  return {
    days: Number(secondary.tripDays) || 1,
    companionType: mapCompanionType(secondary.companionType),
    dailyStartSlot: mapStartSlot(secondary.firstDayStart),
    dailyEndSlot: mapEndSlot(secondary.lastDayEnd),
    dailyDensity: mapDensity(secondary.pace),
    mustExperienceIds: [],
    preferredAreas: [],
    blockedAreas: [],
  };
}
