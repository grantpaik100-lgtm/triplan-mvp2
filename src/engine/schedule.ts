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

function normalizeName(name: string): string {
  return name.replace(/\s+/g, "").trim();
}

function firstToken(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name.trim();
}

/**
 * 더 강한 micro-cluster key
 * - 첫 토큰 기준
 * - 특정 고유 prefix를 강하게 묶음
 */
function getMicroClusterKey(name: string): string {
  const normalized = normalizeName(name);
  const token = firstToken(name);

  const knownPrefixes = [
    "롯데월드",
    "블루보틀",
    "갤러리아",
    "서울숲",
    "현대백화점",
    "더현대",
    "스타필드",
    "노티드",
    "카페어니언",
    "카페어니언성수",
    "IFC",
    "광장시장",
    "통인시장",
  ];

  for (const prefix of knownPrefixes) {
    if (normalized.includes(prefix)) {
      return prefix;
    }
  }

  return token;
}

function microClusterCount(dayPlaces: ScoredPlace[], candidate: ScoredPlace): number {
  const key = getMicroClusterKey(candidate.place.name);

  return dayPlaces.filter((item) => getMicroClusterKey(item.place.name) === key).length;
}

function microClusterPenalty(dayPlaces: ScoredPlace[], candidate: ScoredPlace): number {
  const count = microClusterCount(dayPlaces, candidate);

  if (count === 0) return 0;
  if (count === 1) return 0.22;

  // 2개째부터는 강하게 억제
  return 0.65;
}

function categoryFamily(category: string | null): string {
  if (!category) return "unknown";

  const c = category.trim();

  if (["카페", "디저트", "베이커리"].includes(c)) return "cafe_family";
  if (["음식", "맛집", "식당", "시장"].includes(c)) return "food_family";
  if (["공원", "자연"].includes(c)) return "nature_family";
  if (["전시", "박물관", "미술관"].includes(c)) return "exhibition_family";
  if (["쇼핑", "편집샵"].includes(c)) return "shopping_family";
  if (["체험", "액티비티"].includes(c)) return "activity_family";
  if (["관광지", "문화유산"].includes(c)) return "tourism_family";

  return c;
}

function categoryFamilyCount(dayPlaces: ScoredPlace[], candidate: ScoredPlace): number {
  const family = categoryFamily(candidate.place.category);

  return dayPlaces.filter(
    (item) => categoryFamily(item.place.category) === family
  ).length;
}

function categoryCapPenalty(dayPlaces: ScoredPlace[], candidate: ScoredPlace): number {
  const count = categoryFamilyCount(dayPlaces, candidate);

  if (count === 0) return 0;
  if (count === 1) return 0.12;

  return 0.3;
}

function categoryNoveltyBonus(dayPlaces: ScoredPlace[], candidate: ScoredPlace): number {
  const family = categoryFamily(candidate.place.category);

  const alreadyExists = dayPlaces.some(
    (item) => categoryFamily(item.place.category) === family
  );

  return alreadyExists ? 0 : 0.14;
}

function themeFitBonus(theme: ThemeAxis, candidate: ScoredPlace): number {
  const v = candidate.place.vector;
  if (!v) return 0;

  return (v[theme] ?? 0) * 0.22;
}

function sameRegionBonus(region: string | null, candidate: ScoredPlace): number {
  if (!region) return 0;

  return candidate.place.region === region ? 0.18 : -0.35;
}

/**
 * anchor와 성격이 다르면 support로서 보너스
 * 너무 비슷하면 보너스 적음
 */
function complementBonus(anchor: ScoredPlace, candidate: ScoredPlace): number {
  const av = anchor.place.vector;
  const cv = candidate.place.vector;

  if (!av || !cv) return 0;

  const anchorTheme = getThemeAxisFromPlace(anchor.place);

  // anchor와 같은 축이면 보너스 적고,
  // 다른 축에서 의미 있는 값이 있으면 더 좋게 본다.
  const sameAxisStrength = cv[anchorTheme] ?? 0;

  const otherAxes: ThemeAxis[] = [
    "food",
    "culture",
    "nature",
    "shopping",
    "activity",
    "atmosphere",
    "tourism",
  ].filter((axis) => axis !== anchorTheme) as ThemeAxis[];

  const bestOther = Math.max(...otherAxes.map((axis) => cv[axis] ?? 0));

  if (bestOther >= 0.75 && sameAxisStrength < 0.5) return 0.2;
  if (bestOther >= 0.6 && sameAxisStrength < 0.7) return 0.12;

  return 0;
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
  const expectedProgress = (currentCount + 1) / placesPerDay;

  if (usageRatio > expectedProgress + 0.25) return 0.2;
  if (usageRatio > expectedProgress + 0.15) return 0.08;

  return 0;
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
  const top = regionItems.slice(0, Math.min(regionItems.length, placesPerDay + 3));
  const topScoreSum = top.reduce((acc, item) => acc + item.score, 0);

  const categoryFamilies = new Set(
    top.map((item) => categoryFamily(item.place.category))
  );

  const mustBonus = top.some((item) => mustPlaceIds.has(item.place.id)) ? 3 : 0;
  const diversityBonus = categoryFamilies.size * 0.18;

  return topScoreSum + mustBonus + diversityBonus;
}

function selectAnchor(regionCandidates: ScoredPlace[], mustPlaceIds: Set<string>): ScoredPlace {
  const mustAnchor = regionCandidates.find((item) => mustPlaceIds.has(item.place.id));
  if (mustAnchor) return mustAnchor;

  // 최고점 + 대표성
  const sorted = [...regionCandidates].sort((a, b) => b.score - a.score);
  return sorted[0];
}

function supportGain(
  anchor: ScoredPlace,
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
    complementBonus(anchor, candidate) +
    sameRegionBonus(dayRegion, candidate) -
    microClusterPenalty(dayPlaces, candidate) -
    categoryCapPenalty(dayPlaces, candidate) -
    durationPressurePenalty(
      currentDuration,
      candidate,
      maxDayDurationMin,
      placesPerDay,
      dayPlaces.length
    )
  );
}

export function buildSchedule({
  candidates,
  mustPlaces,
  user,
  maxDayDurationMin = 8 * 60,
}: BuildScheduleParams): DayPlan[] {
  const placesPerDay = user.constraints.placesPerDay;
  const usedPlaceIds = new Set<string>();
  const usedRegions = new Set<string>();
  const schedule: DayPlan[] = [];

  const mustScored = mustPlaces.map(toScoredMustPlace);
  const mergedPool = uniqueByPlaceId([...mustScored, ...candidates]);
  const mustPlaceIds = new Set(mustPlaces.map((p) => p.id));

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
      const repeatPenalty = usedRegions.has(region) ? 0.7 : 0;

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

    const anchor = selectAnchor(regionCandidates, mustPlaceIds);
    const theme = getThemeAxisFromPlace(anchor.place);

    const dayPlaces: ScoredPlace[] = [];
    let dayDuration = 0;

    // 1. anchor 삽입
    if (dayDuration + defaultDuration(anchor.place) <= maxDayDurationMin) {
      dayPlaces.push(anchor);
      usedPlaceIds.add(anchor.place.id);
      dayDuration += defaultDuration(anchor.place);
    }

    // 2. support 삽입
    while (dayPlaces.length < placesPerDay) {
      const remaining = regionCandidates.filter((item) => !usedPlaceIds.has(item.place.id));

      if (remaining.length === 0) break;

      let bestCandidate: ScoredPlace | null = null;
      let bestGain = -Infinity;

      for (const candidate of remaining) {
        const gain = supportGain(
          anchor,
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
