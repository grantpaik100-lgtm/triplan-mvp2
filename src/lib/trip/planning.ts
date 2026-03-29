import { DAILY_EXPERIENCE_COUNT_BY_DENSITY } from "./constants";
import type {
  Area,
  DayPlan,
  ExperienceMetadata,
  PlannedExperience,
  PlanningInput,
  PriorityClass,
  ScoredExperience,
  UserVector,
} from "./types";
import { scoreExperiences } from "./scoring";

function groupByArea(scored: ScoredExperience[]): Record<Area, ScoredExperience[]> {
  return scored.reduce(
    (acc, item) => {
      const key = item.experience.area;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {} as Record<Area, ScoredExperience[]>,
  );
}

function pickTopAreas(grouped: Record<Area, ScoredExperience[]>, days: number): Area[] {
  return Object.entries(grouped)
    .map(([area, items]) => ({
      area: area as Area,
      total: items.slice(0, 5).reduce((sum, item) => sum + item.score, 0),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, Math.max(days, 1))
    .map((x) => x.area);
}

function classifyPriority(scored: ScoredExperience, input: PlanningInput): PriorityClass {
  const exp = scored.experience;

  if (input.mustExperienceIds?.includes(exp.id)) return "anchor";
  if (exp.priorityHints.canBeAnchor && scored.score >= 8) return "anchor";
  if (scored.score >= 6) return "core";
  return "optional";
}

function toPlannedExperience(
  scored: ScoredExperience,
  priority: PriorityClass,
): PlannedExperience {
  return {
    experience: scored.experience,
    priority,
    planningScore: scored.score,
  };
}

function applyDiversitySelection(
  areaPool: ScoredExperience[],
  maxCount: number,
  diversityMode: PlanningInput["diversityMode"],
): ScoredExperience[] {
  if (diversityMode === "theme_focused") {
    return areaPool.slice(0, maxCount + 2);
  }

  const selected: ScoredExperience[] = [];
  const categoryCounts: Record<string, number> = {};

  for (const item of areaPool) {
    const category = item.experience.category;
    const currentCount = categoryCounts[category] ?? 0;

    const maxPerCategory = diversityMode === "diverse" ? 1 : 2;

    if (currentCount >= maxPerCategory) {
      continue;
    }

    selected.push(item);
    categoryCounts[category] = currentCount + 1;

    if (selected.length >= maxCount + 2) {
      break;
    }
  }

  return selected;
}

function ensureMealIncluded(
  selected: ScoredExperience[],
  areaPool: ScoredExperience[],
): ScoredExperience[] {
  const alreadyHasMeal = selected.some((item) => item.experience.isMeal);
  if (alreadyHasMeal) return selected;

  const mealCandidate = areaPool.find(
    (item) =>
      item.experience.isMeal &&
      !selected.some((picked) => picked.experience.id === item.experience.id),
  );

  if (!mealCandidate) return selected;

  const next = [...selected];

  if (next.length > 0) {
    next[next.length - 1] = mealCandidate;
    return next;
  }

  return [mealCandidate];
}

function maybeIncludeRest(
  selected: ScoredExperience[],
  areaPool: ScoredExperience[],
): ScoredExperience[] {
  const alreadyHasRestLike = selected.some(
    (item) =>
      item.experience.category === "cafe" ||
      item.experience.features.quiet >= 0.6,
  );

  if (alreadyHasRestLike) return selected;

  const restCandidate = areaPool.find(
    (item) =>
      !item.experience.isMeal &&
      (item.experience.category === "cafe" ||
        item.experience.features.quiet >= 0.6) &&
      !selected.some((picked) => picked.experience.id === item.experience.id),
  );

  if (!restCandidate) return selected;

  return [...selected, restCandidate];
}


function buildRoughOrder(items: PlannedExperience[]): string[] {
  const timeOrder = [
    "early_morning",
    "morning",
    "late_morning",
    "lunch",
    "afternoon",
    "sunset",
    "dinner",
    "night",
  ];

  return [...items]
    .sort((a, b) => {
      return (
        timeOrder.indexOf(a.experience.preferredTime) -
        timeOrder.indexOf(b.experience.preferredTime)
      );
    })
    .map((item) => item.experience.id);
}

export function planDays(
  user: UserVector,
  input: PlanningInput,
  experiences: ExperienceMetadata[],
): DayPlan[] {
  const scored = scoreExperiences(user, input, experiences);
  const grouped = groupByArea(scored);
  const chosenAreas = pickTopAreas(grouped, input.days);

  const maxPerDay = DAILY_EXPERIENCE_COUNT_BY_DENSITY[input.dailyDensity];
  const dayPlans: DayPlan[] = [];

  for (let day = 1; day <= input.days; day += 1) {
    const primaryArea = chosenAreas[day - 1] ?? chosenAreas[0] ?? "other";
    const areaPool = grouped[primaryArea] ?? [];


      // diversityMode에 따라 category 반복을 제한하면서 후보를 고른다.
    const selectedBase = applyDiversitySelection(
  areaPool,
  maxPerDay,
  input.diversityMode,
);

const selectedWithMeal = ensureMealIncluded(selectedBase, areaPool);
const selected = maybeIncludeRest(selectedWithMeal, areaPool);

console.log("[planning] day selection", {
  day,
  diversityMode: input.diversityMode,
  primaryArea,
  selectedIds: selected.map((x) => x.experience.id),
  selectedCategories: selected.map((x) => x.experience.category),
  hasMeal: selected.some((x) => x.experience.isMeal),
  hasRestLike: selected.some(
    (x) =>
      x.experience.category === "cafe" ||
      x.experience.features.quiet >= 0.6,
  ),
});

const anchor: PlannedExperience[] = [];
const core: PlannedExperience[] = [];
const optional: PlannedExperience[] = [];

    for (const item of selected) {
      const priority = classifyPriority(item, input);
      const planned = toPlannedExperience(item, priority);

      if (priority === "anchor") anchor.push(planned);
      else if (priority === "core") core.push(planned);
      else optional.push(planned);
    }

    // anchor가 하나도 없으면 core 하나 승격
    if (anchor.length === 0 && core.length > 0) {
      const promoted = core.shift()!;
      anchor.push({ ...promoted, priority: "anchor" });
    }

  const prioritizedOptional = [...optional].sort((a, b) => {
  const aMealOrRest =
    a.experience.isMeal ||
    a.experience.category === "cafe" ||
    a.experience.features.quiet >= 0.6;

  const bMealOrRest =
    b.experience.isMeal ||
    b.experience.category === "cafe" ||
    b.experience.features.quiet >= 0.6;

  if (aMealOrRest === bMealOrRest) return 0;
  return aMealOrRest ? -1 : 1;
});

const merged = [...anchor, ...core, ...prioritizedOptional].slice(0, maxPerDay);

    
    const roughOrder = buildRoughOrder(merged);

    dayPlans.push({
      day,
      areas: [primaryArea],
      anchor: merged.filter((x) => x.priority === "anchor"),
      core: merged.filter((x) => x.priority === "core"),
      optional: merged.filter((x) => x.priority === "optional"),
      roughOrder,
    });
  }

  return dayPlans;
}
