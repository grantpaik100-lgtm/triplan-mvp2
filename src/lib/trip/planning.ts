/**
 * TriPlan V3
 * Current Role:
 * - scored candidates를 바탕으로 day-level selection, anchor/core/optional 구성, cluster 전략을 결정하는 planning engine file이다.
 *
 * Target Role:
 * - recommendation/planning stage의 공식 planner로 유지되어야 한다.
 *
 * Chain:
 * - engine
 *
 * Inputs:
 * - PlanningInput
 * - experience candidates
 * - scoring results
 *
 * Outputs:
 * - day plan skeleton
 * - candidate selection diagnostics
 *
 * Called From:
 * - src/lib/trip/engine.ts
 *
 * Side Effects:
 * - 없음
 *
 * Current Status:
 * - canonical
 *
 * Decision:
 * - keep
 *
 * Move Target:
 * - 없음
 *
 * Notes:
 * - scheduling 전에 무엇을 선택할지 결정하는 상위 엔진이다.
 * - TriPlan 핵심 자산 중 Recommendation Engine에 해당한다.
 */
import { DAILY_EXPERIENCE_COUNT_BY_DENSITY } from "./constants";
import type {
  Area,
  DayPlan,
  ExperienceMetadata,
  FunctionalRole,
  PlannedExperience,
  PlanningDiagnostics,
  PlanningInput,
  PlanItemTier,
  PriorityClass,
  ScoredExperience,
  SelectionReason,
  SelectionReasonTag,
  ThemeCluster,
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

function isRestLike(exp: ExperienceMetadata): boolean {
  return (
    exp.functionalRoleHints?.includes("rest") === true ||
    exp.placeType.toLowerCase().includes("cafe") ||
    exp.features.quiet >= 0.6
  );
}

function isTimeSensitive(exp: ExperienceMetadata): boolean {
  return exp.timeFlexibility === "low";
}

function getClusterKey(exp: ExperienceMetadata): ThemeCluster {
  return exp.themeCluster ?? "mixed";
}

function getAnchorScoreBonus(item: ScoredExperience, input: PlanningInput): number {
  let bonus = 0;
  const exp = item.experience;

  if (input.mustExperienceIds?.includes(exp.id)) bonus += 100;
  if (isTimeSensitive(exp)) bonus += 12;
  if (exp.priorityHints.canBeAnchor) bonus += 8;
  if (exp.isMeal) bonus += 3;
  if (exp.isNightFriendly && (exp.preferredTime === "sunset" || exp.preferredTime === "night")) {
    bonus += 4;
  }

  return bonus;
}

function buildSelectionReason(tags: SelectionReasonTag[]): SelectionReason {
  return {
    tags,
    summary: tags.join(", "),
  };
}

function toPlannedExperience(
  scored: ScoredExperience,
  priority: PriorityClass,
  planningTier: PlanItemTier,
  functionalRole: FunctionalRole,
  reasonTags: SelectionReasonTag[],
): PlannedExperience {
  return {
    experience: scored.experience,
    priority,
    planningTier,
    functionalRole,
    themeCluster: scored.experience.themeCluster,
    planningScore: scored.score,
    selectionReason: buildSelectionReason(reasonTags),
  };
}

function dedupeByExperienceId(items: ScoredExperience[]): ScoredExperience[] {
  const seen = new Set<string>();
  const result: ScoredExperience[] = [];

  for (const item of items) {
    if (seen.has(item.experience.id)) continue;
    seen.add(item.experience.id);
    result.push(item);
  }

  return result;
}

function pickAnchors(
  areaPool: ScoredExperience[],
  input: PlanningInput,
): ScoredExperience[] {
  const ranked = [...areaPool]
    .map((item) => ({
      item,
      anchorScore: item.score + getAnchorScoreBonus(item, input),
    }))
    .sort((a, b) => b.anchorScore - a.anchorScore);

  const anchors: ScoredExperience[] = [];
  const usedClusters = new Set<ThemeCluster>();

  for (const { item } of ranked) {
    const exp = item.experience;
    const cluster = getClusterKey(exp);

    const isMust = input.mustExperienceIds?.includes(exp.id) === true;
    const canAnchor =
      isMust ||
      isTimeSensitive(exp) ||
      (exp.priorityHints.canBeAnchor && item.score >= 7);

    if (!canAnchor) continue;

    if (input.diversityMode === "diverse" && usedClusters.has(cluster)) {
      continue;
    }

    anchors.push(item);
    usedClusters.add(cluster);

    const maxAnchors =
      input.diversityMode === "theme_focused" ? 2 : 1;

    if (anchors.length >= maxAnchors) break;
  }

  if (anchors.length === 0 && ranked.length > 0) {
    anchors.push(ranked[0].item);
  }

  return anchors;
}

function getCompatibleClusterSet(
  anchors: ScoredExperience[],
  diversityMode: PlanningInput["diversityMode"],
): Set<ThemeCluster> {
  const anchorClusters = anchors.map((x) => getClusterKey(x.experience));
  const clusterSet = new Set<ThemeCluster>(anchorClusters);

  if (diversityMode === "theme_focused") {
    return clusterSet;
  }

  if (diversityMode === "balanced") {
    if (clusterSet.has("nature_scenery")) clusterSet.add("night_view");
    if (clusterSet.has("food_discovery")) clusterSet.add("cafe_relax");
    if (clusterSet.has("culture_art")) clusterSet.add("walk_local");
    return clusterSet;
  }

  // diverse
  clusterSet.add("food_discovery");
  clusterSet.add("cafe_relax");
  clusterSet.add("nature_scenery");
  clusterSet.add("culture_art");
  clusterSet.add("walk_local");
  return clusterSet;
}

function pickCoreAroundAnchors(
  areaPool: ScoredExperience[],
  anchors: ScoredExperience[],
  input: PlanningInput,
  maxCoreCount: number,
): ScoredExperience[] {
  const anchorIds = new Set(anchors.map((x) => x.experience.id));
  const compatibleClusters = getCompatibleClusterSet(anchors, input.diversityMode);
  const core: ScoredExperience[] = [];
  const clusterCounts: Partial<Record<ThemeCluster, number>> = {};

  const ranked = [...areaPool]
    .filter((item) => !anchorIds.has(item.experience.id))
    .sort((a, b) => b.score - a.score);

  for (const item of ranked) {
    const exp = item.experience;
    const cluster = getClusterKey(exp);

    if (!compatibleClusters.has(cluster) && input.diversityMode !== "diverse") {
      continue;
    }

    if (input.diversityMode === "theme_focused") {
      if (!anchors.some((anchor) => getClusterKey(anchor.experience) === cluster)) {
        continue;
      }
    }

    if (input.diversityMode === "diverse") {
      const count = clusterCounts[cluster] ?? 0;
      if (count >= 1) continue;
    }

    core.push(item);
    clusterCounts[cluster] = (clusterCounts[cluster] ?? 0) + 1;

    if (core.length >= maxCoreCount) break;
  }

  return core;
}

function ensureMealInCoreOrOptional(
  current: ScoredExperience[],
  areaPool: ScoredExperience[],
): ScoredExperience[] {
  if (current.some((item) => item.experience.isMeal)) return current;

  const mealCandidate = areaPool.find(
    (item) =>
      item.experience.isMeal &&
      !current.some((picked) => picked.experience.id === item.experience.id),
  );

  if (!mealCandidate) return current;
  return [...current, mealCandidate];
}

function ensureRestInCoreOrOptional(
  current: ScoredExperience[],
  areaPool: ScoredExperience[],
): ScoredExperience[] {
  if (current.some((item) => isRestLike(item.experience))) return current;

  const restCandidate = areaPool.find(
    (item) =>
      !current.some((picked) => picked.experience.id === item.experience.id) &&
      isRestLike(item.experience),
  );

  if (!restCandidate) return current;
  return [...current, restCandidate];
}

function pickOptionalBuffer(
  areaPool: ScoredExperience[],
  anchors: ScoredExperience[],
  core: ScoredExperience[],
  input: PlanningInput,
  maxOptionalCount: number,
): ScoredExperience[] {
  const usedIds = new Set([
    ...anchors.map((x) => x.experience.id),
    ...core.map((x) => x.experience.id),
  ]);

  const selected: ScoredExperience[] = [];
  const clusterCounts: Partial<Record<ThemeCluster, number>> = {};

  const ranked = [...areaPool]
    .filter((item) => !usedIds.has(item.experience.id))
    .sort((a, b) => {
      const aRepairFriendly =
        a.experience.isMeal || isRestLike(a.experience) || a.experience.timeFlexibility === "high";
      const bRepairFriendly =
        b.experience.isMeal || isRestLike(b.experience) || b.experience.timeFlexibility === "high";

      if (aRepairFriendly !== bRepairFriendly) {
        return aRepairFriendly ? -1 : 1;
      }

      return b.score - a.score;
    });

  for (const item of ranked) {
    const cluster = getClusterKey(item.experience);
    const count = clusterCounts[cluster] ?? 0;

    if (input.diversityMode === "diverse" && count >= 1) {
      continue;
    }

    selected.push(item);
    clusterCounts[cluster] = count + 1;

    if (selected.length >= maxOptionalCount) break;
  }

  return ensureRestInCoreOrOptional(
    ensureMealInCoreOrOptional(selected, areaPool),
    areaPool,
  );
}

function buildPlannedAnchors(
  anchors: ScoredExperience[],
  input: PlanningInput,
): PlannedExperience[] {
  return anchors.map((item) => {
    const tags: SelectionReasonTag[] = [];

    if (input.mustExperienceIds?.includes(item.experience.id)) tags.push("must_experience");
    if (isTimeSensitive(item.experience)) tags.push("time_sensitive");
    if (item.score >= 7) tags.push("high_score");
    if (item.experience.themeCluster) tags.push("cluster_fit");

    return toPlannedExperience(
      item,
      "anchor",
      "anchor",
      "anchor",
      tags.length > 0 ? tags : ["high_score"],
    );
  });
}

function buildPlannedCore(core: ScoredExperience[]): PlannedExperience[] {
  return core.map((item) => {
    const tags: SelectionReasonTag[] = ["anchor_support"];

    if (item.experience.themeCluster) tags.push("cluster_fit");
    if (item.score >= 6) tags.push("high_score");

    let role: FunctionalRole = "core";
    if (item.experience.isMeal) role = "meal";
    else if (isRestLike(item.experience)) role = "rest";
    else if (
      item.experience.functionalRoleHints?.includes("viewpoint") === true
    ) role = "viewpoint";

    return toPlannedExperience(item, "core", "core", role, tags);
  });
}

function buildPlannedOptional(optional: ScoredExperience[]): PlannedExperience[] {
  return optional.map((item) => {
    const tags: SelectionReasonTag[] = ["diversity_fill", "feasibility_safe"];

    let role: FunctionalRole = "optional";
    if (item.experience.isMeal) {
      role = "meal";
      tags.push("meal_requirement");
    } else if (isRestLike(item.experience)) {
      role = "rest";
      tags.push("rest_requirement");
    }

    return toPlannedExperience(item, "optional", "optional", role, tags);
  });
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
  return planDaysWithDiagnostics(user, input, experiences).dayPlans;
}

export function planDaysWithDiagnostics(
  user: UserVector,
  input: PlanningInput,
  experiences: ExperienceMetadata[],
): { dayPlans: DayPlan[]; diagnostics: PlanningDiagnostics } {
  const scored = scoreExperiences(user, input, experiences);
  const grouped = groupByArea(scored);
  const chosenAreas = pickTopAreas(grouped, input.days);

  const maxPerDay = DAILY_EXPERIENCE_COUNT_BY_DENSITY[input.dailyDensity];
  const dayPlans: DayPlan[] = [];
  const dayDiagnostics: PlanningDiagnostics["dayPlans"] = [];

  let totalAnchors = 0;
  let totalCore = 0;
  let totalOptional = 0;
  
  const globallyUsedIds = new Set<string>();

  for (let day = 1; day <= input.days; day += 1) {
    const primaryArea = chosenAreas[day - 1] ?? chosenAreas[0] ?? "other";
    const areaPool = (grouped[primaryArea] ?? []).filter(
      (item) => !globallyUsedIds.has(item.experience.id),
    );

    if (areaPool.length === 0) {
  dayPlans.push({
    day,
    areas: [primaryArea],
    anchor: [],
    core: [],
    optional: [],
    roughOrder: [],
  });

  dayDiagnostics.push({
    dayIndex: day,
    targetClusterStrategy: "empty_pool_fallback",
    anchorIds: [],
    coreIds: [],
    optionalIds: [],
    totalScore: 0,
    clusterDistribution: {},
    notes: ["empty area pool after global dedupe"],
  });

  continue;
}
    

    const anchorCandidates = pickAnchors(areaPool, input);
    const maxCoreCount =
      input.diversityMode === "theme_focused"
        ? Math.max(maxPerDay - anchorCandidates.length - 1, 1)
        : Math.max(maxPerDay - anchorCandidates.length - 2, 1);

    const coreCandidates = pickCoreAroundAnchors(
      areaPool,
      anchorCandidates,
      input,
      maxCoreCount,
    );

    const maxOptionalCount = Math.max(
      maxPerDay - anchorCandidates.length - coreCandidates.length,
      0,
    );

    const optionalCandidates = pickOptionalBuffer(
  areaPool,
  anchorCandidates,
  coreCandidates,
  input,
  maxOptionalCount,
).slice(0, maxOptionalCount);

    const anchors = buildPlannedAnchors(dedupeByExperienceId(anchorCandidates), input);
    const core = buildPlannedCore(
      dedupeByExperienceId(coreCandidates).filter(
        (item) => !anchors.some((x) => x.experience.id === item.experience.id),
      ),
    );
    const optional = buildPlannedOptional(
      dedupeByExperienceId(optionalCandidates).filter(
        (item) =>
          !anchors.some((x) => x.experience.id === item.experience.id) &&
          !core.some((x) => x.experience.id === item.experience.id),
      ),
    );

    const merged = [...anchors, ...core, ...optional].slice(0, maxPerDay);
    for (const item of merged) {
      globallyUsedIds.add(item.experience.id);
    }
    const roughOrder = buildRoughOrder(merged);

    const finalAnchor = merged.filter((x) => x.priority === "anchor");
    const finalCore = merged.filter((x) => x.priority === "core");
    const finalOptional = merged.filter((x) => x.priority === "optional");

    totalAnchors += finalAnchor.length;
    totalCore += finalCore.length;
    totalOptional += finalOptional.length;

    const clusterDistribution = merged.reduce(
      (acc, item) => {
        const cluster = item.themeCluster ?? "mixed";
        acc[cluster] = (acc[cluster] ?? 0) + 1;
        return acc;
      },
      {} as Partial<Record<ThemeCluster, number>>,
    );

    dayDiagnostics.push({
      dayIndex: day,
      targetClusterStrategy:
        input.diversityMode === "diverse"
          ? "cluster dispersion"
          : input.diversityMode === "balanced"
            ? "anchor-centered with partial expansion"
            : "anchor cluster concentration",
      anchorIds: finalAnchor.map((x) => x.experience.id),
      coreIds: finalCore.map((x) => x.experience.id),
      optionalIds: finalOptional.map((x) => x.experience.id),
      totalScore: merged.reduce((sum, item) => sum + item.planningScore, 0),
      clusterDistribution,
      notes: [
        `primaryArea=${primaryArea}`,
        `poolSize=${areaPool.length}`,
        `mergedCount=${merged.length}`,
      ],
    });

    dayPlans.push({
      day,
      areas: [primaryArea],
      anchor: finalAnchor,
      core: finalCore,
      optional: finalOptional,
      roughOrder,
    });
  }

  return {
    dayPlans,
    diagnostics: {
      diversityMode: input.diversityMode,
      totalAnchors,
      totalCore,
      totalOptional,
      dayPlans: dayDiagnostics,
      notes: [
        `days=${input.days}`,
        `dailyDensity=${input.dailyDensity}`,
      ],
    },
  };
}
