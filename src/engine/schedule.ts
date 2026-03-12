// engine/schedule.ts

import { Candidate, DayPlan, ThemeAxis } from "./types";

function getThemeAxis(place: any): ThemeAxis {
  const v = place.vector;

  const axes = [
    { key: "food", val: v.food },
    { key: "culture", val: v.culture },
    { key: "nature", val: v.nature },
    { key: "shopping", val: v.shopping },
    { key: "activity", val: v.activity },
    { key: "atmosphere", val: v.atmosphere },
    { key: "tourism", val: v.tourism }
  ];

  axes.sort((a, b) => (b.val ?? 0) - (a.val ?? 0));

  return axes[0].key as ThemeAxis;
}

function sameBrandPenalty(a: string, b: string) {
  const pa = a.split(" ")[0];
  const pb = b.split(" ")[0];

  if (pa === pb) return 0.25;

  return 0;
}

function marginalGain(
  candidate: Candidate,
  selected: Candidate[],
  theme: ThemeAxis
) {
  let gain = candidate.score;

  const place = candidate.place;

  if (place.vector?.[theme]) {
    gain += place.vector[theme] * 0.3;
  }

  for (const s of selected) {
    gain -= sameBrandPenalty(place.name, s.place.name);
  }

  const catSet = new Set(selected.map((p) => p.place.category));

  if (!catSet.has(place.category)) {
    gain += 0.15;
  }

  return gain;
}

export function buildSchedule(
  candidates: Candidate[],
  days: number,
  placesPerDay: number
): DayPlan[] {

  const result: DayPlan[] = [];
  const remaining = [...candidates];

  for (let d = 0; d < days; d++) {

    if (remaining.length === 0) break;

    const anchor = remaining.shift()!;

    const theme = getThemeAxis(anchor.place);

    const selected: Candidate[] = [anchor];

    while (
      selected.length < placesPerDay &&
      remaining.length > 0
    ) {
      let bestIdx = 0;
      let bestGain = -Infinity;

      for (let i = 0; i < remaining.length; i++) {

        const g = marginalGain(
          remaining[i],
          selected,
          theme
        );

        if (g > bestGain) {
          bestGain = g;
          bestIdx = i;
        }
      }

      selected.push(remaining.splice(bestIdx, 1)[0]);
    }

    const regions = [...new Set(selected.map((p) => p.place.region))];
    const categories = [...new Set(selected.map((p) => p.place.category))];

    const duration = selected.reduce(
      (sum, p) => sum + (p.place.avg_duration_min ?? 60),
      0
    );

    result.push({
      day: d + 1,
      theme,
      places: selected,
      total_estimated_duration_min: duration,
      regions,
      categories
    });
  }

  return result;
}
