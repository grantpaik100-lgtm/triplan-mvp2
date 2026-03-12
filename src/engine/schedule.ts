// src/engine/schedule.ts

import type { DayPlan, Place, ScoredPlace, ThemeAxis, UserModel } from "./types";

type BuildScheduleParams = {
  candidates: ScoredPlace[];
  mustPlaces: Place[];
  user: UserModel;
  maxDayDurationMin?: number;
};

function defaultDuration(place: Place): number {
  return place.avg_duration_min ?? 90;
}

function getThemeAxisFromPlace(place: Place): ThemeAxis {
  const v = place.vector;

  if (!v) return "tourism";

  const axes: Array<{ key: ThemeAxis; val: number }> = [
    { key: "food", val: v.food ?? 0 },
    { key: "culture", val: v.culture ?? 0 },
    { key: "nature", val: v.nature ?? 0 },
    { key: "shopping", val: v.shopping ?? 0 },
    { key: "activity", val: v.activity ?? 0 },
    { key: "atmosphere", val: v.atmosphere ?? 0 },
    { key: "tourism", val: v.tourism ?? 0 },
  ];

  axes.sort((a, b) => b.val - a.val);
  return axes[0].key;
}

function firstToken(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name.trim();
}

function normalizeName(name: string): string {
  return name.replace(/\s+/g, "").trim();
}

function duplicateClusterPenalty(dayPlaces: ScoredPlace[], candidate: ScoredPlace): number {
  const candidateName = candidate.place.name;
  const candidateToken = firstToken(candidateName);
  const candidateNormalized = normalizeName(candidateName);

  let penalty = 0;

  for (const item of dayPlaces) {
    const selectedName = item.place.name;
    const selectedToken = firstToken(selectedName);
    const selectedNormalized = normalizeName(selectedName);

    if (candidateToken === selectedToken) {
      penalty += 0.35;
    }

    if (
      candidateNormalized.includes(selectedNormalized) ||
      selectedNormalized.includes(candidateNormalized)
    ) {
      penalty += 0.2;
    }
  }

  return penalty;
}

function categoryPenalty(dayPlaces: ScoredPlace[], candidate: ScoredPlace): number {
  const category = candidate.place.category;
  if (!category) return 0;

  const sameCategoryCount = dayPlaces.filter((item) => item.place.category === category).length;

  if (sameCategoryCount === 0) return 0;
  if (sameCategoryCount === 1) return 0.12;
  return 0.25;
}

function categoryNoveltyBonus(dayPlaces: ScoredPlace[], candidate: ScoredPlace): number {
  const category = candidate.place.category;
  if (!category) return 0;

  const alreadyExists = dayPlaces.some((item) => item.place.category === category);
  return alreadyExists ? 0 : 0.12;
}

function themeFitBonus(theme: ThemeAxis, candidate: ScoredPlace): number {
  const v = candidate.place.vector;
  if (!v) return 0;
  return (v[theme] ?? 0) * 0.25;
}

function sameRegionBonus(region: string | null, candidate: ScoredPlace): number {
  if (!region) return 0;
  return candidate.place.region === region ? 0.18 : -0.25;
}

function durationPressurePenalty(
  currentDuration: number,
  candidate: ScoredPlace,
  maxDayDurationMin: number,
  placesPerDay: number,
  currentCount: number
): number {
  const nextDuration = currentDuration + defaultDuration(candidate.place);

  if (nextDuration > maxDayDurationMin) {
    return 999;
  }

  const usageRatio = nextDuration / maxDayDurationMin;

  // 슬롯이 아직 많이 남았는데 시간이 너무 빨리 차면 penalty
  const expectedProgress = (currentCount + 1) / placesPerDay;

  if (usageRatio > expectedProgress + 0.25) {
    return 0.18;
  }

  if (usageRatio > expectedProgress + 0.15) {
    return 0.08;
  }

  return 0;
}

function adjustedMarginalGain(
  dayPlaces: ScoredPlace[],
  candidate: ScoredPlace,
  theme: ThemeAxis,
  dayRegion: string | null,
  currentDuration: number,
  maxDayDurationMin: number,
  placesPerDay: number
): number {
  return (
    candidate.score +
    themeFitBonus(theme, candidate) +
    categoryNoveltyBonus(dayPlaces, candidate) +
    sameRegionBonus(dayRegion, candidate) -
    duplicateClusterPenalty(dayPlaces, candidate) -
    categoryPenalty(dayPlaces, candidate) -
    durationPressurePenalty(
      currentDuration,
      candidate,
      maxDayDurationMin,
      placesPerDay,
      dayPlaces.length
    )
  );
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

function groupByRegion(items: ScoredPlace[]): Map<string, ScoredPlace[]> {
  const map = new Map<string, ScoredPlace[]>();

  for (const item of items) {
    const region = item.place.region ?? "unknown";
    if (!map.has(region)) {
      map.set(region, []);
    }
    map.get(region)!.push(item);
  }

  for (const [, arr] of map) {
    arr.sort((a, b) => b.score - a.score);
  }

  return map;
}

function computeRegionStrength(
  regionItems: ScoredPlace[],
  mustPlaceIds: Set<string>,
  placesPerDay: number
): number {
  const top = regionItems.slice(0, Math.min(regionItems.length, placesPerDay + 2));
  const topScoreSum = top.reduce((acc, item) => acc + item.score, 0);

  const categories = new Set(
    top.map((item) => item.place.category).filter(Boolean) as string[]
  );

  const mustBonus = top.some((item) => mustPlaceIds.has(item.place.id)) ? 3 : 0;
  const diversityBonus = categories.size * 0.15;

  return topScoreSum + mustBonus + diversityBonus;
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

  const mustScored = mustPlaces.map(toScoredMustPlace);
  const mergedPool = uniqueByPlaceId([...mustScored, ...candidates]);

  const mustPlaceIds = new Set(mustPlaces.map((p) => p.id));
  const usedRegions = new Set<string>();

  for (let day = 1; day <= user.days; day += 1) {
    const availablePool = mergedPool.filter((item) => !usedPlaceIds.has(item.place.id));

    if (availablePool.length === 0) {
      schedule.push({
        day,
        theme: "tourism",
        places: [],
        total_estimated_duration_min: 0,
        regions: [],
        categories: [],
      });
      continue;
    }

    const regionMap = groupByRegion(availablePool);

    let bestRegion: string | null = null;
    let bestRegionStrength = -Infinity;

    for (const [region, items] of regionMap.entries()) {
      const strength = computeRegionStrength(items, mustPlaceIds, placesPerDay);

      // 이미 쓴 region은 약하게 penalty
      const repeatPenalty = usedRegions.has(region) ? 0.6 : 0;

      if (strength - repeatPenalty > bestRegionStrength) {
        bestRegionStrength = strength - repeatPenalty;
        bestRegion = region;
      }
    }

    const dayRegion = bestRegion ?? "unknown";
    usedRegions.add(dayRegion);

    const regionCandidates = (regionMap.get(dayRegion) ?? []).filter(
      (item) => !usedPlaceIds.has(item.place.id)
    );

    if (regionCandidates.length === 0) {
      schedule.push({
        day,
        theme: "tourism",
        places: [],
        total_estimated_duration_min: 0,
        regions: [],
        categories: [],
      });
      continue;
    }

    // anchor 선정: must place 우선, 없으면 지역 내 최고점
    let anchor =
      regionCandidates.find((item) => mustPlaceIds.has(item.place.id)) ?? regionCandidates[0];

    const theme = getThemeAxisFromPlace(anchor.place);
    const dayPlaces: ScoredPlace[] = [];
    let dayDuration = 0;

    // anchor 삽입
    if (dayDuration + defaultDuration(anchor.place) <= maxDayDurationMin) {
      dayPlaces.push(anchor);
      usedPlaceIds.add(anchor.place.id);
      dayDuration += defaultDuration(anchor.place);
    }

    while (dayPlaces.length < placesPerDay) {
      const remaining = regionCandidates.filter((item) => !usedPlaceIds.has(item.place.id));

      if (remaining.length === 0) break;

      let bestCandidate: ScoredPlace | null = null;
      let bestGain = -Infinity;

      for (const candidate of remaining) {
        const gain = adjustedMarginalGain(
          dayPlaces,
          candidate,
          theme,
          dayRegion,
          dayDuration,
          maxDayDurationMin,
          placesPerDay
        );

        if (gain > bestGain) {
          bestGain = gain;
          bestCandidate = candidate;
        }
      }

      if (!bestCandidate) break;
      if (bestGain < -100) break;

      const duration = defaultDuration(bestCandidate.place);
      if (dayDuration + duration > maxDayDurationMin) break;

      dayPlaces.push(bestCandidate);
      usedPlaceIds.add(bestCandidate.place.id);
      dayDuration += duration;
    }

    schedule.push({
      day,
      theme,
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
