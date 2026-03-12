// src/engine/schedule.ts

import type {
  DayPlan,
  DaySlot,
  Place,
  ScoredPlace,
  ThemeAxis,
  UserModel,
} from "./types";

type BuildScheduleParams = {
  candidates: ScoredPlace[];
  mustPlaces: Place[];
  user: UserModel;
  maxDayDurationMin?: number;
};

const SLOT_ORDER: DaySlot[] = ["morning", "midday", "afternoon", "evening"];

function activeSlotsByPlacesPerDay(placesPerDay: number): DaySlot[] {
  if (placesPerDay <= 1) return ["afternoon"];
  if (placesPerDay === 2) return ["midday", "evening"];
  if (placesPerDay === 3) return ["morning", "afternoon", "evening"];
  return SLOT_ORDER;
}

function defaultDuration(place: Place): number {
  return place.avg_duration_min ?? 90;
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

function getThemeAxisFromPlace(place: Place): ThemeAxis {
  const v = place.vector;

  if (!v) return "tourism";

  const axes: Array<{ key: ThemeAxis; value: number }> = [
    { key: "food", value: v.food ?? 0 },
    { key: "culture", value: v.culture ?? 0 },
    { key: "nature", value: v.nature ?? 0 },
    { key: "shopping", value: v.shopping ?? 0 },
    { key: "activity", value: v.activity ?? 0 },
    { key: "atmosphere", value: v.atmosphere ?? 0 },
    { key: "tourism", value: v.tourism ?? 0 },
  ];

  axes.sort((a, b) => b.value - a.value);
  return axes[0]?.key ?? "tourism";
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

function categoryKey(place: Place): string {
  return (place.category ?? "unknown").trim().toLowerCase();
}

function regionKey(place: Place): string {
  return (place.region ?? "unknown").trim().toLowerCase();
}

function selectAnchor(pool: ScoredPlace[]): ScoredPlace {
  const sorted = [...pool].sort((a, b) => b.score - a.score);
  return sorted[0];
}

function scoreDayFit(params: {
  candidate: ScoredPlace;
  anchor: ScoredPlace;
  selected: ScoredPlace[];
  selectedRegions: Set<string>;
  selectedCategories: Set<string>;
  currentDuration: number;
  maxDayDurationMin: number;
}): number {
  const {
    candidate,
    anchor,
    selected,
    selectedRegions,
    selectedCategories,
    currentDuration,
    maxDayDurationMin,
  } = params;

  let score = candidate.score;

  const candidateDuration = defaultDuration(candidate.place);
  const nextDuration = currentDuration + candidateDuration;

  if (nextDuration > maxDayDurationMin) {
    return -999999;
  }

  const anchorRegion = regionKey(anchor.place);
  const candidateRegion = regionKey(candidate.place);

  if (candidateRegion === anchorRegion) {
    score += 0.15;
  }

  if (selectedRegions.has(candidateRegion)) {
    score += 0.08;
  }

  const cKey = categoryKey(candidate.place);

  if (selectedCategories.has(cKey)) {
    score -= 0.1;
  }

  const usageRatio = nextDuration / maxDayDurationMin;

  if (usageRatio > 0.95) score -= 0.12;
  else if (usageRatio > 0.85) score -= 0.06;

  if (selected.some((item) => item.place.id === candidate.place.id)) {
    score -= 999999;
  }

  return score;
}

function buildDayPlan(params: {
  day: number;
  pool: ScoredPlace[];
  placesPerDay: number;
  maxDayDurationMin: number;
}): DayPlan {
  const { day, pool, placesPerDay, maxDayDurationMin } = params;

  const slots = activeSlotsByPlacesPerDay(placesPerDay);
  const uniquePool = uniqueByPlaceId(pool);

  if (uniquePool.length === 0) {
    return {
      day,
      theme: "tourism",
      places: [],
      slottedPlaces: [],
      total_estimated_duration_min: 0,
      regions: [],
      categories: [],
    };
  }

  const anchor = selectAnchor(uniquePool);

  const selected: ScoredPlace[] = [anchor];
  const selectedRegions = new Set<string>([regionKey(anchor.place)]);
  const selectedCategories = new Set<string>([categoryKey(anchor.place)]);

  let totalDuration = defaultDuration(anchor.place);

  while (selected.length < placesPerDay) {
    let bestCandidate: ScoredPlace | null = null;
    let bestScore = -Infinity;

    for (const candidate of uniquePool) {
      if (selected.some((item) => item.place.id === candidate.place.id)) {
        continue;
      }

      const fitScore = scoreDayFit({
        candidate,
        anchor,
        selected,
        selectedRegions,
        selectedCategories,
        currentDuration: totalDuration,
        maxDayDurationMin,
      });

      if (fitScore > bestScore) {
        bestScore = fitScore;
        bestCandidate = candidate;
      }
    }

    if (!bestCandidate || bestScore < -100000) {
      break;
    }

    selected.push(bestCandidate);
    selectedRegions.add(regionKey(bestCandidate.place));
    selectedCategories.add(categoryKey(bestCandidate.place));
    totalDuration += defaultDuration(bestCandidate.place);
  }

  const slottedPlaces = selected
    .slice(0, slots.length)
    .map((item, index) => ({
      slot: slots[index],
      item,
    }));

  return {
    day,
    theme: getThemeAxisFromPlace(anchor.place),
    places: selected,
    slottedPlaces,
    total_estimated_duration_min: totalDuration,
    regions: Array.from(
      new Set(
        selected
          .map((item) => item.place.region)
          .filter((v): v is string => Boolean(v))
      )
    ),
    categories: Array.from(
      new Set(
        selected
          .map((item) => item.place.category)
          .filter((v): v is string => Boolean(v))
      )
    ),
  };
}

export function buildSchedule({
  candidates,
  mustPlaces,
  user,
  maxDayDurationMin = 8 * 60,
}: BuildScheduleParams): DayPlan[] {
  const mustScored = mustPlaces.map(toScoredMustPlace);
  const mergedPool = uniqueByPlaceId([...mustScored, ...candidates]);

  const days = Math.max(1, user.days);
  const placesPerDay = Math.max(1, user.constraints.placesPerDay);

  const schedule: DayPlan[] = [];
  const usedPlaceIds = new Set<string>();

  for (let day = 1; day <= days; day++) {
    const remainingPool = mergedPool.filter(
      (item) => !usedPlaceIds.has(item.place.id)
    );

    if (remainingPool.length === 0) {
      schedule.push({
        day,
        theme: "tourism",
        places: [],
        slottedPlaces: [],
        total_estimated_duration_min: 0,
        regions: [],
        categories: [],
      });
      continue;
    }

    const dayPlan = buildDayPlan({
      day,
      pool: remainingPool,
      placesPerDay,
      maxDayDurationMin,
    });

    for (const item of dayPlan.places) {
      usedPlaceIds.add(item.place.id);
    }

    schedule.push(dayPlan);
  }

  return schedule;
}