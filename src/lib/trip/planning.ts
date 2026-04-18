/**
 * TriPlan V3
 * Current Role:
 * - scored candidates를 바탕으로 day-level selection, anchor/core/optional 구성, cluster 전략을 결정하는 planning engine file이다.
 *
 * Target Role:
 * - recommendation/planning stage의 공식 planner로 유지되어야 한다.
 * - scheduling-friendly compact day plan을 만들고, peak / recovery 후보를 planning 단계에서 먼저 확정한다.
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
 * - 이번 버전에서는 day composition(opener / peak / recovery_or_meal)을 hard rule로 반영한다.
 * - primaryArea 안에서 composition을 만족하지 못하면 spillover pool에서 보강한다.
 * - extended skeleton은 임시 차단한다.
 * - recovery는 "좋아 보이는 후보"가 아니라 "peak 뒤에 실제로 붙일 가능성이 높은 후보"를 우선 선택한다.
 */

import { DAILY_EXPERIENCE_COUNT_BY_DENSITY } from "./constants";
import type {
  Area,
  DayPlan,
  DaySkeletonType,
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

type DayNarrativeRole = "immersion" | "peak" | "recovery";

type PlanningCompactSelectionResult = {
  items: PlannedExperience[];
  skeletonType: DaySkeletonType;
  hardCap: number;
  targetItemCount: number;
  peakCandidate?: PlannedExperience;
  recoveryCandidate?: PlannedExperience;
  lateFallbackIds: string[];
  spareCapacity: number;
};

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

function getDayNarrativeRole(dayIndex: number, totalDays: number): DayNarrativeRole {
  if (dayIndex === 1) return "immersion";
  if (dayIndex === totalDays) return "recovery";
  return "peak";
}

function isRestLike(exp: ExperienceMetadata): boolean {
  const placeType = exp.placeType ?? "";

  return (
    exp.functionalRoleHints?.includes("rest") === true ||
    placeType.toLowerCase().includes("cafe") ||
    exp.features.quiet >= 0.6
  );
}

function isTimeSensitive(exp: ExperienceMetadata): boolean {
  return exp.timeFlexibility === "low";
}

function getClusterKey(exp: ExperienceMetadata): ThemeCluster {
  return exp.themeCluster ?? "mixed";
}

function isOpenerCandidate(exp: ExperienceMetadata): boolean {
  const allowed = exp.allowedTimes ?? [];

  const hasEarlyWindow =
    allowed.includes("morning") ||
    allowed.includes("late_morning") ||
    allowed.includes("lunch") ||
    allowed.includes("afternoon");

  return (
    hasEarlyWindow &&
    exp.fatigue <= 3 &&
    exp.preferredTime !== "night" &&
    exp.isNightFriendly !== true
  );
}

function isPeakCandidate(exp: ExperienceMetadata): boolean {
  return (
    exp.priorityHints.canBeAnchor ||
    exp.preferredTime === "sunset" ||
    exp.preferredTime === "night" ||
    exp.isNightFriendly
  );
}

function isRecoveryOrMealCandidate(exp: ExperienceMetadata): boolean {
  return isRestLike(exp) || exp.isMeal;
}

function getAnchorScoreBonus(
  item: ScoredExperience,
  input: PlanningInput,
  narrative: DayNarrativeRole,
): number {
  let bonus = 0;
  const exp = item.experience;

  if (input.mustExperienceIds?.includes(exp.id)) bonus += 100;
  if (isTimeSensitive(exp)) bonus += 12;
  if (exp.priorityHints.canBeAnchor) bonus += 8;
  if (exp.isMeal) bonus += 3;

  if (exp.isNightFriendly && (exp.preferredTime === "sunset" || exp.preferredTime === "night")) {
    bonus += narrative === "peak" ? 8 : 2;
  }

  if (narrative === "immersion" && exp.preferredTime === "night") {
    bonus -= 8;
  }

  if (narrative === "recovery" && exp.fatigue >= 4) {
    bonus -= 8;
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

function sortByScoreDesc(items: ScoredExperience[]): ScoredExperience[] {
  return [...items].sort((a, b) => b.score - a.score);
}

function buildPrimaryAreaPool(
  grouped: Record<Area, ScoredExperience[]>,
  primaryArea: Area,
  globallyUsedIds: Set<string>,
): ScoredExperience[] {
  return (grouped[primaryArea] ?? []).filter(
    (item) => !globallyUsedIds.has(item.experience.id),
  );
}

function buildSpilloverPool(
  scored: ScoredExperience[],
  primaryArea: Area,
  globallyUsedIds: Set<string>,
): ScoredExperience[] {
  return scored.filter(
    (item) =>
      item.experience.area !== primaryArea &&
      !globallyUsedIds.has(item.experience.id),
  );
}

function pickAnchors(
  primaryAreaPool: ScoredExperience[],
  input: PlanningInput,
  narrative: DayNarrativeRole,
): ScoredExperience[] {
  const ranked = [...primaryAreaPool]
    .map((item) => ({
      item,
      anchorScore: item.score + getAnchorScoreBonus(item, input, narrative),
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

    if (narrative === "immersion" && exp.preferredTime === "night" && !isMust) {
      continue;
    }

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

  clusterSet.add("food_discovery");
  clusterSet.add("cafe_relax");
  clusterSet.add("nature_scenery");
  clusterSet.add("culture_art");
  clusterSet.add("walk_local");
  return clusterSet;
}

function pickCoreAroundAnchors(
  primaryAreaPool: ScoredExperience[],
  anchors: ScoredExperience[],
  input: PlanningInput,
  maxCoreCount: number,
): ScoredExperience[] {
  const anchorIds = new Set(anchors.map((x) => x.experience.id));
  const compatibleClusters = getCompatibleClusterSet(anchors, input.diversityMode);
  const core: ScoredExperience[] = [];
  const clusterCounts: Partial<Record<ThemeCluster, number>> = {};

  const ranked = [...primaryAreaPool]
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
  primaryAreaPool: ScoredExperience[],
): ScoredExperience[] {
  if (current.some((item) => item.experience.isMeal)) return current;

  const mealCandidate = primaryAreaPool.find(
    (item) =>
      item.experience.isMeal &&
      !current.some((picked) => picked.experience.id === item.experience.id),
  );

  if (!mealCandidate) return current;
  return [...current, mealCandidate];
}

function ensureRestInCoreOrOptional(
  current: ScoredExperience[],
  primaryAreaPool: ScoredExperience[],
): ScoredExperience[] {
  if (current.some((item) => isRestLike(item.experience))) return current;

  const restCandidate = primaryAreaPool.find(
    (item) =>
      !current.some((picked) => picked.experience.id === item.experience.id) &&
      isRestLike(item.experience),
  );

  if (!restCandidate) return current;
  return [...current, restCandidate];
}

function pickOptionalBuffer(
  primaryAreaPool: ScoredExperience[],
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

  const ranked = [...primaryAreaPool]
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
    ensureMealInCoreOrOptional(selected, primaryAreaPool),
    primaryAreaPool,
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
    else if (item.experience.functionalRoleHints?.includes("viewpoint") === true) role = "viewpoint";

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

function getOrderScore(item: PlannedExperience): number {
  if (item.functionalRole === "rest") return 70;
  if (item.functionalRole === "meal") return 60;
  if (item.priority === "anchor") return 50;

  switch (item.experience.preferredTime) {
    case "early_morning":
      return 10;
    case "morning":
      return 15;
    case "late_morning":
      return 20;
    case "lunch":
      return 30;
    case "afternoon":
      return 40;
    case "sunset":
      return 55;
    case "dinner":
      return 65;
    case "night":
      return 80;
    default:
      return 45;
  }
}

function buildRoughOrder(items: PlannedExperience[]): string[] {
  return [...items]
    .sort((a, b) => getOrderScore(a) - getOrderScore(b))
    .map((item) => item.experience.id);
}

function hasOpener(items: PlannedExperience[]): boolean {
  return items.some((item) => isOpenerCandidate(item.experience));
}

function hasPeak(items: PlannedExperience[]): boolean {
  return items.some((item) => isPeakCandidate(item.experience));
}

function hasRecoveryOrMeal(items: PlannedExperience[]): boolean {
  return items.some((item) => isRecoveryOrMealCandidate(item.experience));
}

function getCoverageSet(items: PlannedExperience[]) {
  return {
    openerIds: new Set(
      items.filter((item) => isOpenerCandidate(item.experience)).map((item) => item.experience.id),
    ),
    peakIds: new Set(
      items.filter((item) => isPeakCandidate(item.experience)).map((item) => item.experience.id),
    ),
    recoveryIds: new Set(
      items
        .filter((item) => isRecoveryOrMealCandidate(item.experience))
        .map((item) => item.experience.id),
    ),
  };
}

function trimToMaxPerDay(
  items: PlannedExperience[],
  maxPerDay: number,
  narrative: DayNarrativeRole,
): PlannedExperience[] {
  let working = [...items];

  while (working.length > maxPerDay) {
    const coverage = getCoverageSet(working);

    const removable = working
      .map((item) => {
        const removingLeavesNoOpener =
          coverage.openerIds.has(item.experience.id) && coverage.openerIds.size === 1;
        const removingLeavesNoPeak =
          coverage.peakIds.has(item.experience.id) && coverage.peakIds.size === 1;
        const removingLeavesNoRecovery =
          coverage.recoveryIds.has(item.experience.id) && coverage.recoveryIds.size === 1;

        const protectedByNarrative =
          (narrative === "immersion" &&
            (removingLeavesNoOpener || (removingLeavesNoPeak && removingLeavesNoRecovery))) ||
          (narrative === "peak" &&
            (removingLeavesNoPeak || (removingLeavesNoOpener && removingLeavesNoRecovery))) ||
          (narrative === "recovery" &&
            (removingLeavesNoRecovery || (removingLeavesNoOpener && removingLeavesNoPeak)));

        let removalScore = 0;
        if (item.priority === "optional") removalScore += 100;
        if (item.priority === "core") removalScore += 50;
        if (item.functionalRole === "rest" || item.functionalRole === "meal") removalScore += 10;
        if (item.priority === "anchor") removalScore -= 100;
        if (protectedByNarrative) removalScore -= 200;

        return { item, removalScore };
      })
      .sort((a, b) => b.removalScore - a.removalScore);

    const target = removable[0]?.item;
    if (!target) break;

    working = working.filter((item) => item.experience.id !== target.experience.id);
  }

  return [...working].sort((a, b) => getOrderScore(a) - getOrderScore(b));
}

function buildCoverageCandidate(
  scored: ScoredExperience,
  role: "opener" | "peak" | "recovery_or_meal",
  fromSpillover: boolean,
): PlannedExperience {
  if (role === "peak") {
    return toPlannedExperience(
      scored,
      scored.experience.priorityHints.canBeAnchor ? "anchor" : "core",
      scored.experience.priorityHints.canBeAnchor ? "anchor" : "core",
      scored.experience.priorityHints.canBeAnchor ? "anchor" : "core",
      fromSpillover
        ? ["cluster_fit", "high_score", "feasibility_safe"]
        : ["cluster_fit", "high_score"],
    );
  }

  if (role === "recovery_or_meal") {
    return toPlannedExperience(
      scored,
      "optional",
      "optional",
      scored.experience.isMeal ? "meal" : "rest",
      scored.experience.isMeal
        ? fromSpillover
          ? ["meal_requirement", "feasibility_safe"]
          : ["meal_requirement"]
        : fromSpillover
          ? ["rest_requirement", "feasibility_safe"]
          : ["rest_requirement"],
    );
  }

  return toPlannedExperience(
    scored,
    "optional",
    "optional",
    scored.experience.isMeal ? "meal" : "optional",
    fromSpillover
      ? ["feasibility_safe", "diversity_fill"]
      : ["feasibility_safe"],
  );
}

function addCoverageCandidate(
  current: PlannedExperience[],
  primaryAreaPool: ScoredExperience[],
  spilloverPool: ScoredExperience[],
  predicate: (exp: ExperienceMetadata) => boolean,
  role: "opener" | "peak" | "recovery_or_meal",
): PlannedExperience[] {
  const usedIds = new Set(current.map((item) => item.experience.id));

  const primaryCandidate = primaryAreaPool.find(
    (item) =>
      !usedIds.has(item.experience.id) &&
      predicate(item.experience),
  );

  if (primaryCandidate) {
    return [...current, buildCoverageCandidate(primaryCandidate, role, false)];
  }

  const spilloverCandidate = spilloverPool.find(
    (item) =>
      !usedIds.has(item.experience.id) &&
      predicate(item.experience),
  );

  if (spilloverCandidate) {
    return [...current, buildCoverageCandidate(spilloverCandidate, role, true)];
  }

  return current;
}

function ensureDayComposition(
  items: PlannedExperience[],
  primaryAreaPool: ScoredExperience[],
  spilloverPool: ScoredExperience[],
  narrative: DayNarrativeRole,
  maxPerDay: number,
): PlannedExperience[] {
  let result = [...items];

  const needOpener =
    narrative === "immersion"
      ? !hasOpener(result)
      : narrative === "peak"
        ? !hasOpener(result) && !hasRecoveryOrMeal(result)
        : !hasOpener(result) && !hasPeak(result);

  const needPeak =
    narrative === "peak"
      ? !hasPeak(result)
      : narrative === "immersion"
        ? !hasPeak(result) && !hasRecoveryOrMeal(result)
        : false;

  const needRecovery =
    narrative === "recovery"
      ? !hasRecoveryOrMeal(result)
      : narrative === "peak"
        ? !hasRecoveryOrMeal(result) && !hasOpener(result)
        : false;

  if (needOpener) {
    result = addCoverageCandidate(
      result,
      primaryAreaPool,
      spilloverPool,
      isOpenerCandidate,
      "opener",
    );
  }

  if (needPeak) {
    result = addCoverageCandidate(
      result,
      primaryAreaPool,
      spilloverPool,
      isPeakCandidate,
      "peak",
    );
  }

  if (needRecovery) {
    result = addCoverageCandidate(
      result,
      primaryAreaPool,
      spilloverPool,
      isRecoveryOrMealCandidate,
      "recovery_or_meal",
    );
  }

  return trimToMaxPerDay(result, maxPerDay, narrative);
}

function getAreasFromMerged(merged: PlannedExperience[]): Area[] {
  return Array.from(new Set(merged.map((item) => item.experience.area)));
}

function getSkeletonHardCap(skeletonType: DaySkeletonType): number {
  switch (skeletonType) {
    case "short":
    case "relaxed":
      return 3;
    case "balanced":
    case "peak_centric":
      return 4;
    case "extended":
      return 4;
    default:
      return 4;
  }
}

function selectPlanningSkeleton(params: {
  input: PlanningInput;
  narrative: DayNarrativeRole;
}): DaySkeletonType {
  const { input, narrative } = params;

  if (narrative === "recovery") {
    return "relaxed";
  }

  if (narrative === "peak") {
    return "peak_centric";
  }

  if (input.dailyDensity <= 2) {
    return "short";
  }

  return "balanced";
}

function toSelectionRole(
  item: PlannedExperience,
  peakId?: string,
  recoveryId?: string,
): "peak_candidate" | "recovery_candidate" | "core_support" | "optional_spare" {
  if (item.experience.id === peakId) return "peak_candidate";
  if (item.experience.id === recoveryId) return "recovery_candidate";
  if (item.priority === "optional") return "optional_spare";
  return "core_support";
}

function scorePeakForPlanning(item: PlannedExperience): number {
  const exp = item.experience;
  const tags = item.selectionReason?.tags ?? [];

  return (
    item.planningScore * 1.2 +
    (item.priority === "anchor" ? 1.2 : 0) +
    (tags.includes("must_experience") ? 1.5 : 0) +
    (tags.includes("time_sensitive") ? 0.8 : 0) +
    (exp.preferredTime === "sunset" || exp.preferredTime === "night" ? 0.8 : 0) +
    (exp.isNightFriendly ? 0.5 : 0) -
    (exp.fatigue >= 5 ? 0.6 : 0)
  );
}

function canServeAsLateRecovery(exp: ExperienceMetadata): boolean {
  const allowed = exp.allowedTimes ?? [];
  const canLateFit =
    allowed.includes("afternoon") ||
    allowed.includes("sunset") ||
    allowed.includes("dinner") ||
    allowed.includes("night");

  return (
    canLateFit &&
    exp.recommendedDuration <= 90 &&
    exp.fatigue <= 3 &&
    exp.timeFlexibility !== "low" &&
    isRecoveryOrMealCandidate(exp)
  );
}

function scoreRecoveryFeasibility(
  item: PlannedExperience,
  peak?: PlannedExperience,
): number {
  const exp = item.experience;
  const allowed = exp.allowedTimes ?? [];
  const sameArea = peak ? exp.area === peak.experience.area : false;
  const sameCluster = peak ? item.themeCluster === peak.themeCluster : false;
  const lateWindowBonus =
    (allowed.includes("dinner") ? 1.0 : 0) +
    (allowed.includes("sunset") ? 0.8 : 0) +
    (allowed.includes("night") ? 0.7 : 0) +
    (allowed.includes("afternoon") ? 0.4 : 0);

  return (
    item.planningScore * 0.55 +
    lateWindowBonus +
    (exp.isMeal ? 0.9 : 0) +
    (isRestLike(exp) ? 0.7 : 0) +
    (exp.timeFlexibility === "high" ? 0.8 : exp.timeFlexibility === "medium" ? 0.35 : 0) +
    (sameArea ? 0.9 : 0) +
    (sameCluster ? 0.5 : 0) -
    (exp.recommendedDuration > 90 ? 2.0 : 0) -
    (exp.fatigue >= 4 ? 1.0 : 0)
  );
}

function pickFeasibleRecoveryCandidate(
  merged: PlannedExperience[],
  optionalPool: PlannedExperience[],
  peakCandidate?: PlannedExperience,
): PlannedExperience | undefined {
  const peakId = peakCandidate?.experience.id;

  return [...merged, ...optionalPool]
    .filter((item) => item.experience.id !== peakId)
    .filter((item) => canServeAsLateRecovery(item.experience))
    .sort(
      (a, b) =>
        scoreRecoveryFeasibility(b, peakCandidate) -
        scoreRecoveryFeasibility(a, peakCandidate),
    )[0];
}

function compactDaySelection(params: {
  merged: PlannedExperience[];
  optionalPool: PlannedExperience[];
  skeletonType: DaySkeletonType;
  maxPerDay: number;
  narrative: DayNarrativeRole;
}): PlanningCompactSelectionResult {
  const { merged, optionalPool, skeletonType, maxPerDay, narrative } = params;

  const hardCap = Math.min(getSkeletonHardCap(skeletonType), maxPerDay);

  const peakCandidate = [...merged]
    .filter((item) => isPeakCandidate(item.experience))
    .sort((a, b) => scorePeakForPlanning(b) - scorePeakForPlanning(a))[0];

    const recoveryCandidate = pickFeasibleRecoveryCandidate(
    merged,
    optionalPool,
    peakCandidate,
  );

  const lateFallbackIds = [...optionalPool, ...merged]
    .filter((item) => item.experience.id !== peakCandidate?.experience.id)
    .filter((item) => item.experience.id !== recoveryCandidate?.experience.id)
    .filter((item) => canServeAsLateRecovery(item.experience))
    .sort((a, b) => {
      const aSameArea =
        (recoveryCandidate && a.experience.area === recoveryCandidate.experience.area ? 2 : 0) +
        (peakCandidate && a.experience.area === peakCandidate.experience.area ? 1 : 0);

      const bSameArea =
        (recoveryCandidate && b.experience.area === recoveryCandidate.experience.area ? 2 : 0) +
        (peakCandidate && b.experience.area === peakCandidate.experience.area ? 1 : 0);

      const aSameCluster =
        (recoveryCandidate && a.themeCluster === recoveryCandidate.themeCluster ? 2 : 0) +
        (peakCandidate && a.themeCluster === peakCandidate.themeCluster ? 1 : 0);

      const bSameCluster =
        (recoveryCandidate && b.themeCluster === recoveryCandidate.themeCluster ? 2 : 0) +
        (peakCandidate && b.themeCluster === peakCandidate.themeCluster ? 1 : 0);

      return (bSameArea + bSameCluster + b.planningScore) - (aSameArea + aSameCluster + a.planningScore);
    })
    .map((item) => item.experience.id)
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .slice(0, 3);

  let targetItemCount =
    skeletonType === "relaxed" || skeletonType === "short" ? 3 : 4;

  if (!recoveryCandidate) {
    targetItemCount = narrative === "recovery" ? 2 : Math.min(targetItemCount, 3);
  }

  targetItemCount = Math.min(targetItemCount, hardCap);

  const selected: PlannedExperience[] = [];
  const usedIds = new Set<string>();

  const pushItem = (item?: PlannedExperience) => {
    if (!item) return;
    if (usedIds.has(item.experience.id)) return;
    if (selected.length >= targetItemCount) return;
    usedIds.add(item.experience.id);
    selected.push(item);
  };

  if (narrative !== "recovery") {
    const openerCandidate = [...merged, ...optionalPool]
      .filter((item) => !usedIds.has(item.experience.id))
      .find((item) => isOpenerCandidate(item.experience));

    pushItem(openerCandidate);
  }

  pushItem(peakCandidate);
  pushItem(recoveryCandidate);

  const supportPool = [...merged]
    .filter((item) => !usedIds.has(item.experience.id))
    .sort((a, b) => {
      const aNearPeak =
        peakCandidate &&
        (a.experience.area === peakCandidate.experience.area ||
          a.themeCluster === peakCandidate.themeCluster)
          ? 1
          : 0;

      const bNearPeak =
        peakCandidate &&
        (b.experience.area === peakCandidate.experience.area ||
          b.themeCluster === peakCandidate.themeCluster)
          ? 1
          : 0;

      const aPriorityRank = a.priority === "anchor" ? 2 : a.priority === "core" ? 1 : 0;
      const bPriorityRank = b.priority === "anchor" ? 2 : b.priority === "core" ? 1 : 0;

      return (
        bNearPeak * 3 +
        bPriorityRank +
        b.planningScore -
        (aNearPeak * 3 + aPriorityRank + a.planningScore)
      );
    });

  for (const item of supportPool) {
    pushItem(item);
  }

  if (selected.length < targetItemCount && recoveryCandidate) {
    for (const item of optionalPool) {
      pushItem(item);
    }
  }

  const trimmed = selected.slice(0, targetItemCount);

    return {
    items: trimmed,
    skeletonType,
    hardCap,
    targetItemCount,
    peakCandidate,
    recoveryCandidate,
    lateFallbackIds,
    spareCapacity: Math.max(0, hardCap - trimmed.length),
  };
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
  const scored = sortByScoreDesc(scoreExperiences(user, input, experiences));
  const grouped = groupByArea(scored);
  const chosenAreas = pickTopAreas(grouped, input.days);

  const densityMaxPerDay = DAILY_EXPERIENCE_COUNT_BY_DENSITY[input.dailyDensity];
  const dayPlans: DayPlan[] = [];
  const dayDiagnostics: PlanningDiagnostics["dayPlans"] = [];

  let totalAnchors = 0;
  let totalCore = 0;
  let totalOptional = 0;

  const globallyUsedIds = new Set<string>();

  for (let day = 1; day <= input.days; day += 1) {
    const primaryArea = chosenAreas[day - 1] ?? chosenAreas[0] ?? "other";
    const dayNarrative = getDayNarrativeRole(day, input.days);

    const primaryAreaPool = buildPrimaryAreaPool(grouped, primaryArea, globallyUsedIds);
    const spilloverPool = buildSpilloverPool(scored, primaryArea, globallyUsedIds);

    if (primaryAreaPool.length === 0 && spilloverPool.length === 0) {
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
        notes: ["empty pool after global dedupe"],
      });

      continue;
    }

    const anchorCandidates = pickAnchors(primaryAreaPool, input, dayNarrative);

    const maxCoreCount =
      input.diversityMode === "theme_focused"
        ? Math.max(densityMaxPerDay - anchorCandidates.length - 1, 1)
        : Math.max(densityMaxPerDay - anchorCandidates.length - 2, 1);

    const coreCandidates = pickCoreAroundAnchors(
      primaryAreaPool,
      anchorCandidates,
      input,
      maxCoreCount,
    );

    const maxOptionalCount = Math.max(
      densityMaxPerDay - anchorCandidates.length - coreCandidates.length,
      0,
    );

    const optionalCandidates = pickOptionalBuffer(
      primaryAreaPool,
      anchorCandidates,
      coreCandidates,
      input,
      maxOptionalCount + 1,
    ).slice(0, maxOptionalCount + 1);

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

    const mergedBase = [...anchors, ...core];
    const merged = ensureDayComposition(
      mergedBase,
      primaryAreaPool,
      spilloverPool,
      dayNarrative,
      densityMaxPerDay,
    );

    const skeletonType = selectPlanningSkeleton({
      input,
      narrative: dayNarrative,
    });

    const compact = compactDaySelection({
      merged,
      optionalPool: optional,
      skeletonType,
      maxPerDay: densityMaxPerDay,
      narrative: dayNarrative,
    });

    for (const item of compact.items) {
      globallyUsedIds.add(item.experience.id);
    }

    const roughOrder = buildRoughOrder(compact.items);

    const finalAnchor = compact.items.filter((x) => x.priority === "anchor");
    const finalCore = compact.items.filter((x) => x.priority === "core");
    const finalOptional = compact.items.filter((x) => x.priority === "optional");

    totalAnchors += finalAnchor.length;
    totalCore += finalCore.length;
    totalOptional += finalOptional.length;

    const clusterDistribution = compact.items.reduce(
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
      totalScore: compact.items.reduce((sum, item) => sum + item.planningScore, 0),
      clusterDistribution,
      skeletonType: compact.skeletonType,
      targetItemCount: compact.targetItemCount,
      hardCap: compact.hardCap,
      peakCandidateId: compact.peakCandidate?.experience.id,
      recoveryCandidateId: compact.recoveryCandidate?.experience.id,
      selectedOrder: roughOrder,
      spareCapacity: compact.spareCapacity,
      notes: [
        `primaryArea=${primaryArea}`,
        `narrative=${dayNarrative}`,
        `primaryPool=${primaryAreaPool.length}`,
        `spilloverPool=${spilloverPool.length}`,
        `mergedCount=${compact.items.length}`,
        `areas=${getAreasFromMerged(compact.items).join(",")}`,
        `hasOpener=${hasOpener(compact.items)}`,
        `hasPeak=${hasPeak(compact.items)}`,
        `hasRecoveryOrMeal=${hasRecoveryOrMeal(compact.items)}`,
        `skeleton=${compact.skeletonType}`,
        `targetItemCount=${compact.targetItemCount}`,
        `hardCap=${compact.hardCap}`,
        `peakCandidate=${compact.peakCandidate?.experience.id ?? "none"}`,
        `recoveryCandidate=${compact.recoveryCandidate?.experience.id ?? "none"}`,
        `spareCapacity=${compact.spareCapacity}`,
      ],
    });

    dayPlans.push({
      day,
      areas: getAreasFromMerged(compact.items),
      anchor: finalAnchor,
      core: finalCore,
      optional: finalOptional,
      roughOrder,
            selection: {
        skeletonType: compact.skeletonType,
        hardCap: compact.hardCap,
        targetItemCount: compact.targetItemCount,
        peakCandidateId: compact.peakCandidate?.experience.id,
        recoveryCandidateId: compact.recoveryCandidate?.experience.id,
        lateFallbackIds: compact.lateFallbackIds,
        selectedOrder: roughOrder,
        spareCapacity: compact.spareCapacity,
        items: compact.items.map((item) => ({
          experienceId: item.experience.id,
          role: toSelectionRole(
            item,
            compact.peakCandidate?.experience.id,
            compact.recoveryCandidate?.experience.id,
          ),
          priority: item.priority,
          planningTier: item.planningTier,
          functionalRole: item.functionalRole,
          planningScore: item.planningScore,
        })),
      },
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
