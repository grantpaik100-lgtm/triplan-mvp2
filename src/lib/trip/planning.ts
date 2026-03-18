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

    // 약간 여유 있게 뽑아놓고 priority 분류 후 잘라냄
    const selected = areaPool.slice(0, maxPerDay + 2);

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

    const merged = [...anchor, ...core, ...optional].slice(0, maxPerDay);
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
