import type {
  PlanTripInput,
  PrimarySurveyResult,
  SecondarySurveyResult,
  UserModel,
  UserPreferenceVector,
} from "./types";

export function densityToPlaces(density: number): number {
  switch (density) {
    case 1:
      return 2;
    case 2:
      return 3;
    case 3:
      return 4;
    case 4:
      return 5;
    case 5:
      return 6;
    default:
      return 4;
  }
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeLikert5(value?: number, fallback = 3): number {
  const v = value ?? fallback;
  return clamp01((v - 1) / 4);
}

function buildPreferenceVector(
  primary: PrimarySurveyResult,
  secondary: SecondarySurveyResult
): UserPreferenceVector {
  const rest = clamp01(primary.rest);
  const schedule = clamp01(primary.schedule);
  const mood = clamp01(primary.mood);
  const strategy = clamp01(primary.strategy);

  const foodImportance = normalizeLikert5(secondary.food_importance, 3);
  const pace = normalizeLikert5(secondary.pace, 3);
  const walkTolerance = normalizeLikert5(secondary.walk_tolerance, 3);
  const waitingTolerance = normalizeLikert5(secondary.waiting_tolerance, 3);
  const budgetLevel = normalizeLikert5(secondary.budget_level, 3);
  const density = normalizeLikert5(secondary.daily_density, 3);

  return {
    food: clamp01(0.45 * foodImportance + 0.15 * mood + 0.1 * rest),
    culture: clamp01(0.35 * mood + 0.25 * strategy + 0.15 * schedule),
    nature: clamp01(0.4 * rest + 0.2 * mood + 0.1 * walkTolerance),
    shopping: clamp01(0.25 * mood + 0.1 * schedule + 0.15 * budgetLevel),
    activity: clamp01(0.35 * strategy + 0.25 * pace + 0.2 * walkTolerance),
    atmosphere: clamp01(0.45 * mood + 0.2 * rest),
    tourism: clamp01(0.3 * strategy + 0.2 * mood + 0.2 * schedule),
    price: clamp01(1 - budgetLevel),
    crowd: clamp01(1 - waitingTolerance),
    duration: clamp01(0.35 * rest + 0.2 * density + 0.1 * schedule),
  };
}

export function buildUserModel(input: PlanTripInput): UserModel {
  const primary = input.primary;
  const secondary = input.secondary;

  const placesPerDay = densityToPlaces(secondary.daily_density);

  return {
    city: secondary.city ?? "Seoul",
    days: secondary.days,
    companion: secondary.companion ?? null,
    primary,
    secondary,
    preferenceVector: buildPreferenceVector(primary, secondary),
    constraints: {
      dailyDensity: secondary.daily_density,
      placesPerDay,
      budgetLevel: secondary.budget_level ?? 3,
      walkTolerance: secondary.walk_tolerance ?? 3,
      waitingTolerance: secondary.waiting_tolerance ?? 3,
      pace: secondary.pace ?? 3,
      chronotype: secondary.chronotype ?? "neutral",
    },
    must: {
      placeIds: secondary.must_place_ids ?? [],
      foods: secondary.must_foods ?? [],
      experiences: secondary.must_experiences ?? [],
    },
  };
}
