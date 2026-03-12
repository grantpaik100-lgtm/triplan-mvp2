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

function activeSlotsByDensity(placesPerDay: number): DaySlot[] {
  if (placesPerDay <= 2) return ["midday", "afternoon"];
  if (placesPerDay === 3) return ["morning", "afternoon", "evening"];
  return ["morning", "midday", "afternoon", "evening"];
}

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

function microClusterHardBlocked(dayPlaces: ScoredPlace[], candidate: ScoredPlace): boolean {
  return microClusterCount(dayPlaces, candidate) >= 2;
}

function microClusterPenalty(dayPlaces: ScoredPlace[], candidate: ScoredPlace): number {
  const count = microClusterCount(dayPlaces, candidate);

  if (count === 0) return 0;
  if (count === 1) return 0.22;
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

  return dayPlaces.filter((item) => categoryFamily(item.place.category) === family).length;
}

function categoryHardBlocked(dayPlaces: ScoredPlace[], candidate: ScoredPlace): boolean {
  return categoryFamilyCount(dayPlaces, candidate) >= 2;
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

function complementBonus(anchor: ScoredPlace, candidate: ScoredPlace): number {
  const cv = candidate.place.vector;
  if (!cv) return 0;

  const anchorTheme = getThemeAxisFromPlace(anchor.place);
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

function anchorRepresentativeBonus(item: ScoredPlace): number {
  const tourism = item.place.vector?.tourism ?? 0;
  const culture = item.place.vector?.culture ?? 0;
  const atmosphere = item.place.vector?.atmosphere ?? 0;

  let bonus = tourism * 0.35 + culture * 0.08;

  const family = categoryFamily(item.place.category);

  if (family === "tourism_family") bonus += 0.18;
  if (family === "nature_family") bonus += 0.08;
  if (family === "shopping_family") bonus += 0.05;
  if (family === "cafe_family") bonus -= 0.06;

  if (atmosphere >= 0.8) bonus += 0.03;

  return bonus;
}

function selectAnchor(regionCandidates: ScoredPlace[], mustPlaceIds: Set<string>): ScoredPlace {
  const mustAnchor = regionCandidates.find((item) => mustPlaceIds.has(item.place.id));
  if (mustAnchor) return mustAnchor;

  let best: ScoredPlace | null = null;
  let bestScore = -Infinity;

  for (const item of regionCandidates) {
    const score = item.score + anchorRepresentativeBonus(item);
    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }

  return best ?? regionCandidates[0];
}

function slotAffinity(candidate: ScoredPlace, slot: DaySlot, theme: ThemeAxis): number {
  const family = categoryFamily(candidate.place.category);
  const v = candidate.place.vector;

  if (!v) return 0;

  let score = 0;

  if (slot === "morning") {
    if (family === "tourism_family") score += 0.28;
    if (family === "nature_family") score += 0.22;
    if (family === "exhibition_family") score += 0.18;
    if (family === "activity_family") score += 0.08;
    if (family === "shopping_family") score -= 0.04;
    if (family === "cafe_family") score -= 0.06;
    if (family === "food_family") score -= 0.06;
    score += (v.tourism ?? 0) * 0.1;
    score += (v.culture ?? 0) * 0.08;
  }

  if (slot === "midday") {
    if (family === "food_family") score += 0.32;
    if (family === "cafe_family") score += 0.22;
    if (family === "shopping_family") score += 0.06;
    if (family === "nature_family") score -= 0.03;
    score += (v.food ?? 0) * 0.12;
  }

  if (slot === "afternoon") {
    if (family === "shopping_family") score += 0.24;
    if (family === "activity_family") score += 0.22;
    if (family === "nature_family") score += 0.14;
    if (family === "exhibition_family") score += 0.12;
    score += (v.activity ?? 0) * 0.1;
    score += (v.shopping ?? 0) * 0.1;
  }

  if (slot === "evening") {
    if (family === "cafe_family") score += 0.34;
    if (family === "food_family") score += 0.26;
    if (family === "shopping_family") score += 0.04;
    if (family === "exhibition_family") score -= 0.12;
    if (family === "nature_family") score -= 0.12;
    if (family === "tourism_family") score -= 0.08;
    if (family === "activity_family") score -= 0.06;
    score += (v.atmosphere ?? 0) * 0.18;
    score += (v.food ?? 0) * 0.06;
  }

  score += (v[theme] ?? 0) * 0.05;

  return score;
}

function bestSlotForAnchor(anchor: ScoredPlace, activeSlots: DaySlot[], theme: ThemeAxis): DaySlot {
  const family = categoryFamily(anchor.place.category);

  if (family === "nature_family" || family === "tourism_family" || family === "exhibition_family") {
    if (activeSlots.includes("morning")) return "morning";
  }

  if (family === "shopping_family" || family === "activity_family") {
    if (activeSlots.includes("afternoon")) return "afternoon";
  }

  if (family === "cafe_family" || family === "food_family") {
    if (activeSlots.includes("evening")) return "evening";
  }

  let bestSlot = activeSlots[0];
  let bestScore = -Infinity;

  for (const slot of activeSlots) {
    const score = slotAffinity(anchor, slot, theme);
    if (score > bestScore) {
      bestScore = score;
      bestSlot = slot;
    }
  }

  return bestSlot;
}

function supportGain(
  anchor: ScoredPlace,
  dayPlaces: ScoredPlace[],
  candidate: ScoredPlace,
  theme: ThemeAxis,
  dayRegion: string | null,
  slot: DaySlot,
  currentDuration: number,
  maxDayDurationMin: number,
  placesPerDay: number
): number {
  return (
    candidate.score +
    themeFitBonus(theme, candidate) +
    categoryNoveltyBonus(dayPlaces, candidate) +
    complementBonus(anchor, candidate) +
    sameRegionBonus(dayRegion, candidate) +
    slotAffinity(candidate, slot, theme) -
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

function pickBestCandidateForSlot(
  remaining: ScoredPlace[],
  anchor: ScoredPlace,
  dayPlaces: ScoredPlace[],
  theme: ThemeAxis,
  dayRegion: string | null,
  slot: DaySlot,
  dayDuration: number,
  maxDayDurationMin: number,
  placesPerDay: number,
  options: {
    enforceMicroClusterCap: boolean;
    enforceCategoryCap: boolean;
  }
): ScoredPlace | null {
  let bestCandidate: ScoredPlace | null = null;
  let bestGain = -Infinity;

  for (const candidate of remaining) {
    if (options.enforceMicroClusterCap && microClusterHardBlocked(dayPlaces, candidate)) {
      continue;
    }

    if (options.enforceCategoryCap && categoryHardBlocked(dayPlaces, candidate)) {
      continue;
    }

    const gain = supportGain(
      anchor,
      dayPlaces,
      candidate,
      theme,
      dayRegion,
      slot,
      dayDuration,
      maxDayDurationMin,
      placesPerDay
    );

    if (gain > bestGain) {
      bestGain = gain;
      bestCandidate = candidate;
    }
  }

  if (bestGain < -100) return null;
  return bestCandidate;
}

export function buildSchedule({
  candidates,
  mustPlaces,
  user,
  maxDayDurationMin = 8 * 60,
}: BuildScheduleParams): DayPlan[] {
  const placesPerDay = user.constraints.placesPerDay;
  const activeSlots = activeSlotsByDensity(placesPerDay);

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
        slottedPlaces: [],
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
        slottedPlaces: [],
        total_estimated_duration_min: 0,
        regions: [],
        categories: [],
      });
      continue;
    }

    const anchor = selectAnchor(regionCandidates, mustPlaceIds);
    const theme = getThemeAxisFromPlace(anchor.place);

    const dayPlaces: ScoredPlace[] = [];
    const slottedPlaces: Array<{ slot: DaySlot; item: ScoredPlace }> = [];
    let dayDuration = 0;

    const anchorSlot = bestSlotForAnchor(anchor, activeSlots, theme);

    if (dayDuration + defaultDuration(anchor.place) <= maxDayDurationMin) {
      dayPlaces.push(anchor);
      slottedPlaces.push({ slot: anchorSlot, item: anchor });
      usedPlaceIds.add(anchor.place.id);
      dayDuration += defaultDuration(anchor.place);
    }

    const remainingSlots = activeSlots.filter((slot) => slot !== anchorSlot);

    for (const slot of remainingSlots) {
      if (dayPlaces.length >= placesPerDay) break;

      const remaining = regionCandidates.filter((item) => !usedPlaceIds.has(item.place.id));
      if (remaining.length === 0) break;

      // 1차: micro-cluster cap + category cap 둘 다 적용
      let bestCandidate = pickBestCandidateForSlot(
        remaining,
        anchor,
        dayPlaces,
        theme,
        dayRegion,
        slot,
        dayDuration,
        maxDayDurationMin,
        placesPerDay,
        {
          enforceMicroClusterCap: true,
          enforceCategoryCap: true,
        }
      );

      // 2차 fallback: micro-cluster cap은 유지, category cap만 완화
      if (!bestCandidate) {
        bestCandidate = pickBestCandidateForSlot(
          remaining,
          anchor,
          dayPlaces,
          theme,
          dayRegion,
          slot,
          dayDuration,
          maxDayDurationMin,
          placesPerDay,
          {
            enforceMicroClusterCap: true,
            enforceCategoryCap: false,
          }
        );
      }

      if (!bestCandidate) continue;

      const duration = defaultDuration(bestCandidate.place);
      if (dayDuration + duration > maxDayDurationMin) continue;

      dayPlaces.push(bestCandidate);
      slottedPlaces.push({ slot, item: bestCandidate });
      usedPlaceIds.add(bestCandidate.place.id);
      dayDuration += duration;
    }

    const slotIndex = new Map<DaySlot, number>(SLOT_ORDER.map((slot, idx) => [slot, idx]));
    slottedPlaces.sort((a, b) => slotIndex.get(a.slot)! - slotIndex.get(b.slot)!);

    schedule.push({
      day,
      theme,
      places: slottedPlaces.map((entry) => entry.item),
      slottedPlaces,
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
