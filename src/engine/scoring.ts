import type { Place, ScoreBreakdown, ScoredPlace, UserModel } from "./types";

function safe(v: number | null | undefined): number {
  return v ?? 0;
}

function budgetPenalty(place: Place, user: UserModel): number {
  const userBudget = user.constraints.budgetLevel; // 1~5, 높을수록 여유
  const placePrice = place.price_level ?? 3;       // 1~5, 높을수록 비쌈

  if (placePrice <= userBudget) return 0;

  return (placePrice - userBudget) * 0.08;
}

function crowdPenalty(place: Place, user: UserModel): number {
  const tolerateCrowd = user.constraints.waitingTolerance; // 1~5 높을수록 붐빔 허용
  const placeCrowd = place.crowd_level ?? 3;               // 1~5

  if (placeCrowd <= tolerateCrowd) return 0;

  return (placeCrowd - tolerateCrowd) * 0.05;
}

function durationPenalty(place: Place, user: UserModel): number {
  const density = user.constraints.dailyDensity; // 1~5
  const duration = place.avg_duration_min ?? 90;

  if (density >= 4 && duration > 150) return 0.12;
  if (density <= 2 && duration < 45) return 0.05;

  return 0;
}

function axisAffinity(place: Place, user: UserModel): number {
  const v = place.vector;
  const u = user.preferenceVector;

  if (!v) return 0;

  return (
    u.food * safe(v.food) +
    u.culture * safe(v.culture) +
    u.nature * safe(v.nature) +
    u.shopping * safe(v.shopping) +
    u.activity * safe(v.activity) +
    u.atmosphere * safe(v.atmosphere) +
    u.tourism * safe(v.tourism) +
    u.price * safe(v.price) +
    u.crowd * safe(v.crowd) +
    u.duration * safe(v.duration)
  );
}

export function scorePlace(place: Place, user: UserModel): ScoredPlace {
  const affinity = axisAffinity(place, user);
  const bPenalty = budgetPenalty(place, user);
  const cPenalty = crowdPenalty(place, user);
  const dPenalty = durationPenalty(place, user);

  const finalScore = Math.max(0, affinity - bPenalty - cPenalty - dPenalty);

  const breakdown: ScoreBreakdown = {
    axisAffinity: affinity,
    budgetPenalty: bPenalty,
    crowdPenalty: cPenalty,
    durationPenalty: dPenalty,
    finalScore,
  };

  return {
    place,
    score: finalScore,
    breakdown,
  };
}

export function scorePlaces(places: Place[], user: UserModel): ScoredPlace[] {
  return places.map((place) => scorePlace(place, user));
}
