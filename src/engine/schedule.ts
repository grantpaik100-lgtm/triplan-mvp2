import {
  ScoredPlace,
  DayPlan,
  SlotType,
  Constraints
} from "./types";

const SLOT_ORDER: SlotType[] = [
  "morning",
  "midday",
  "afternoon",
  "evening"
];

function activeSlotsByDensity(density: number): SlotType[] {
  if (density <= 2) return ["midday", "evening"];
  if (density === 3) return ["morning", "afternoon", "evening"];
  return SLOT_ORDER;
}

function defaultDuration(place: ScoredPlace) {
  return place.place.avg_duration_min ?? 60;
}

function uniqueByPlaceId(pool: ScoredPlace[]): ScoredPlace[] {
  const seen = new Set<string>();
  const result: ScoredPlace[] = [];

  for (const p of pool) {
    if (!seen.has(p.place.id)) {
      seen.add(p.place.id);
      result.push(p);
    }
  }

  return result;
}

function scoreDayFit(
  place: ScoredPlace,
  anchor: ScoredPlace,
  usedCategories: Set<string>
) {
  let score = place.score;

  if (place.place.region === anchor.place.region) {
    score += 0.15;
  }

  if (usedCategories.has(place.place.category)) {
    score -= 0.1;
  }

  return score;
}

function selectAnchor(pool: ScoredPlace[]) {
  const sorted = [...pool].sort((a, b) => b.score - a.score);
  return sorted[0];
}

function buildSimpleDayPlan(
  day: number,
  pool: ScoredPlace[],
  constraints: Constraints
): DayPlan {

  const slots = activeSlotsByDensity(constraints.dailyDensity);
  const placesPerDay = constraints.placesPerDay;

  const anchor = selectAnchor(pool);

  const usedCategories = new Set<string>();
  const selected: ScoredPlace[] = [anchor];

  usedCategories.add(anchor.place.category);

  let totalDuration = defaultDuration(anchor);

  const remaining = pool.filter(p => p.place.id !== anchor.place.id);

  const ranked = remaining
    .map(p => ({
      place: p,
      score: scoreDayFit(p, anchor, usedCategories)
    }))
    .sort((a, b) => b.score - a.score);

  for (const r of ranked) {
    if (selected.length >= placesPerDay) break;

    const duration = defaultDuration(r.place);

    if (totalDuration + duration > 480) continue;

    selected.push(r.place);
    usedCategories.add(r.place.place.category);

    totalDuration += duration;
  }

  const slottedPlaces = slots.map((slot, i) => ({
    slot,
    item: selected[i] ?? null
  }));

  return {
    day,
    theme: anchor.place.category,
    places: selected,
    slottedPlaces,
    regions: [...new Set(selected.map(p => p.place.region))],
    categories: [...new Set(selected.map(p => p.place.category))],
    total_estimated_duration_min: totalDuration
  };
}

export function buildSchedule(
  pool: ScoredPlace[],
  constraints: Constraints
): DayPlan[] {

  const uniquePool = uniqueByPlaceId(pool);

  const schedule: DayPlan[] = [];

  for (let day = 1; day <= constraints.days; day++) {
    const dayPlan = buildSimpleDayPlan(day, uniquePool, constraints);
    schedule.push(dayPlan);
  }

  return schedule;
}
