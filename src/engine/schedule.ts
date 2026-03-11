import type { DayPlan, Place, ScoredPlace, UserModel } from "./types";

type BuildScheduleParams = {
  candidates: ScoredPlace[];
  mustPlaces: Place[];
  user: UserModel;
  maxDayDurationMin?: number;
};

function defaultDuration(place: Place): number {
  return place.avg_duration_min ?? 90;
}

function categoryPenalty(dayPlaces: ScoredPlace[], candidate: ScoredPlace): number {
  const category = candidate.place.category;
  if (!category) return 0;

  const alreadyExists = dayPlaces.some((item) => item.place.category === category);
  return alreadyExists ? 0.18 : 0;
}

function regionPenalty(dayPlaces: ScoredPlace[], candidate: ScoredPlace): number {
  const region = candidate.place.region;
  if (!region || dayPlaces.length === 0) return 0;

  const sameRegionCount = dayPlaces.filter((item) => item.place.region === region).length;
  if (sameRegionCount > 0) return 0;

  return 0.14;
}

function adjustedScore(dayPlaces: ScoredPlace[], candidate: ScoredPlace): number {
  return (
    candidate.score -
    categoryPenalty(dayPlaces, candidate) -
    regionPenalty(dayPlaces, candidate)
  );
}

function toScoredMustPlace(place: Place): ScoredPlace {
  return {
    place,
    score: 9999,
    breakdown: {
      axisAffinity: 9999,
      budgetPenalty: 0,
      crowdPenalty: 0,
      durationPenalty: 0,
      finalScore: 9999,
    },
  };
}

function uniqueByPlaceId(items: ScoredPlace[]): ScoredPlace[] {
  const seen = new Set<string>();
  const result: ScoredPlace[] = [];

  for (const item of items) {
    if (seen.has(item.place.id)) continue;
    seen.add(item.place.id);
    result.push(item);
  }

  return result;
}

export function buildSchedule({
  candidates,
  mustPlaces,
  user,
  maxDayDurationMin = 8 * 60,
}: BuildScheduleParams): DayPlan[] {
  const placesPerDay = user.constraints.placesPerDay;
  const usedPlaceIds = new Set<string>();
  const schedule: DayPlan[] = [];

  const candidatePool = uniqueByPlaceId(candidates);
  const mustPool = uniqueByPlaceId(mustPlaces.map(toScoredMustPlace));

  for (let day = 1; day <= user.days; day += 1) {
    const dayPlaces: ScoredPlace[] = [];
    let dayDuration = 0;

    // 1) must place 먼저 넣기
    for (const must of mustPool) {
      if (dayPlaces.length >= placesPerDay) break;
      if (usedPlaceIds.has(must.place.id)) continue;

      const duration = defaultDuration(must.place);
      if (dayDuration + duration > maxDayDurationMin) continue;

      dayPlaces.push(must);
      usedPlaceIds.add(must.place.id);
      dayDuration += duration;
    }

    // 2) 남은 슬롯 채우기
    while (dayPlaces.length < placesPerDay) {
      let best: ScoredPlace | null = null;
      let bestAdjusted = -Infinity;

      for (const candidate of candidatePool) {
        if (usedPlaceIds.has(candidate.place.id)) continue;

        const duration = defaultDuration(candidate.place);
        if (dayDuration + duration > maxDayDurationMin) continue;

        const score = adjustedScore(dayPlaces, candidate);

        if (score > bestAdjusted) {
          bestAdjusted = score;
          best = candidate;
        }
      }

      if (!best) break;

      dayPlaces.push(best);
      usedPlaceIds.add(best.place.id);
      dayDuration += defaultDuration(best.place);
    }

    schedule.push({
      day,
      places: dayPlaces,
      total_estimated_duration_min: dayDuration,
      regions: Array.from(
        new Set(dayPlaces.map((p) => p.place.region).filter(Boolean) as string[])
      ),
      categories: Array.from(
        new Set(dayPlaces.map((p) => p.place.category).filter(Boolean) as string[])
      ),
    });
  }

  return schedule;
}
