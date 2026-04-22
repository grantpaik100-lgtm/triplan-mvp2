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
  FallbackEntry,
  FlowRole,
  FunctionalRole,
  PlannedExperience,
  PlanningDiagnostics,
  PlanningInput,
  PlanningTimeBudget,
  PinConfidence,
  PlanItemTier,
  PriorityClass,
  ScoredExperience,
  SelectionReason,
  SelectionReasonTag,
  StructuralPin,
  ThemeCluster,
  UserVector,
} from "./types";
import { scoreExperiences } from "./scoring";
import { estimateTravelMinutes } from "./scheduling";

type DayNarrativeRole = "immersion" | "peak" | "recovery";

type RecoverySelectionSource = "strict" | "fallback" | "none";

type RecoverySelectionResult = {
  candidate?: PlannedExperience;
  source: RecoverySelectionSource;
  scoreBreakdown: string;
};

type PlanningCompactSelectionResult = {
  items: PlannedExperience[];
  skeletonType: DaySkeletonType;
  hardCap: number;
  targetItemCount: number;
  peakCandidate?: PlannedExperience;
  recoveryCandidate?: PlannedExperience;
  recoverySource: RecoverySelectionSource;
  recoveryScoreBreakdown: string;
  lateFallbackIds: string[];
  lateFallbackReserve: PlannedExperience[];
  spareCapacity: number;
};

function canServeAsLateFallback(exp: ExperienceMetadata): boolean {
  return (
    exp.recommendedDuration <= 120 &&
    exp.fatigue <= 4 &&
    (exp.timeFlexibility === "high" ||
      exp.timeFlexibility === "medium") &&
    (
      exp.isMeal ||
      isRestLike(exp) ||
      exp.features.quiet >= 0.4 ||
      exp.features.local >= 0.4
    )
  );
}

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
      return 2;
    case "relaxed":
      return 3;
    case "balanced":
      return 4;
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
    if (input.companionType === "family") {
      return "balanced";
    }
    return "peak_centric";
  }

  if (input.dailyDensity <= 2) {
    return "short";
  }

  if (input.companionType === "family") {
    return "relaxed";
  }

  if (input.companionType === "couple" && input.dailyDensity <= 3) {
    return "balanced";
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

function getRecoveryScoreComponents(
  item: PlannedExperience,
  peak: PlannedExperience | undefined,
  source: Exclude<RecoverySelectionSource, "none">,
  narrative: DayNarrativeRole,
): {
  total: number;
  breakdown: string;
} {
  const exp = item.experience;
  const allowed = exp.allowedTimes ?? [];
  const sameArea = peak ? exp.area === peak.experience.area : false;
  const sameCluster = peak ? item.themeCluster === peak.themeCluster : false;

  const planningBase = item.planningScore * 0.55;
  const lateWindowBonus =
    (allowed.includes("dinner") ? 1.0 : 0) +
    (allowed.includes("sunset") ? 0.8 : 0) +
    (allowed.includes("night") ? 0.7 : 0) +
    (allowed.includes("afternoon") ? 0.4 : 0);

  const mealBonus = exp.isMeal ? 0.9 : 0;
  const restBonus = isRestLike(exp) ? 0.7 : 0;
  const flexibilityBonus =
    exp.timeFlexibility === "high"
      ? 0.8
      : exp.timeFlexibility === "medium"
        ? 0.35
        : 0;

  const sameAreaBonus =
    sameArea ? (source === "fallback" && narrative === "peak" ? 1.25 : 0.9) : 0;

  const sameClusterBonus =
    sameCluster ? (source === "fallback" && narrative === "peak" ? 0.8 : 0.5) : 0;

  const fallbackUsabilityBonus =
    source === "fallback"
      ? (exp.features.quiet >= 0.4 ? 0.45 : 0) +
        (exp.features.local >= 0.4 ? 0.25 : 0) +
        (exp.recommendedDuration <= 75 ? 0.3 : 0)
      : 0;

  const durationPenalty =
    source === "strict"
      ? exp.recommendedDuration > 90
        ? 2.0
        : 0
      : exp.recommendedDuration > 90
        ? 0.8
        : 0;

  const fatiguePenalty =
    source === "strict"
      ? exp.fatigue >= 4
        ? 1.0
        : 0
      : exp.fatigue >= 4
        ? 0.7
        : 0;

  const total =
    planningBase +
    lateWindowBonus +
    mealBonus +
    restBonus +
    flexibilityBonus +
    sameAreaBonus +
    sameClusterBonus +
    fallbackUsabilityBonus -
    durationPenalty -
    fatiguePenalty;

  const breakdown = [
    `source=${source}`,
    `id=${exp.id}`,
    `total=${total.toFixed(2)}`,
    `planningBase=${planningBase.toFixed(2)}`,
    `lateWindow=${lateWindowBonus.toFixed(2)}`,
    `meal=${mealBonus.toFixed(2)}`,
    `rest=${restBonus.toFixed(2)}`,
    `flex=${flexibilityBonus.toFixed(2)}`,
    `sameArea=${sameAreaBonus.toFixed(2)}`,
    `sameCluster=${sameClusterBonus.toFixed(2)}`,
    `fallbackUse=${fallbackUsabilityBonus.toFixed(2)}`,
    `durationPenalty=${durationPenalty.toFixed(2)}`,
    `fatiguePenalty=${fatiguePenalty.toFixed(2)}`,
  ].join("|");

  return {
    total,
    breakdown,
  };
}

function pickTopRecoveryCandidate(
  pool: PlannedExperience[],
  peakCandidate: PlannedExperience | undefined,
  source: Exclude<RecoverySelectionSource, "none">,
  narrative: DayNarrativeRole,
): RecoverySelectionResult {
  const ranked = [...pool]
    .map((item) => {
      const scored = getRecoveryScoreComponents(item, peakCandidate, source, narrative);
      return {
        item,
        total: scored.total,
        breakdown: scored.breakdown,
      };
    })
    .sort((a, b) => b.total - a.total);

  if (ranked.length === 0) {
    return {
      candidate: undefined,
      source: "none",
      scoreBreakdown: `source=${source}|candidate=none`,
    };
  }

  return {
    candidate: ranked[0].item,
    source,
    scoreBreakdown: ranked[0].breakdown,
  };
}

function pickFeasibleRecoveryCandidate(
  merged: PlannedExperience[],
  optionalPool: PlannedExperience[],
  peakCandidate: PlannedExperience | undefined,
  narrative: DayNarrativeRole,
): RecoverySelectionResult {
  const peakId = peakCandidate?.experience.id;

  const basePool = [...merged, ...optionalPool].filter(
    (item) => item.experience.id !== peakId,
  );

  const strictPool = basePool.filter((item) =>
    canServeAsLateRecovery(item.experience),
  );

  if (strictPool.length > 0) {
    return pickTopRecoveryCandidate(strictPool, peakCandidate, "strict", narrative);
  }

  const fallbackPool = basePool.filter((item) =>
    canServeAsLateFallback(item.experience),
  );

  if (fallbackPool.length > 0) {
    return pickTopRecoveryCandidate(fallbackPool, peakCandidate, "fallback", narrative);
  }

  return {
    candidate: undefined,
    source: "none",
    scoreBreakdown: "source=none|candidate=none",
  };
}

function getTargetItemCount(params: {
  skeletonType: DaySkeletonType;
  hardCap: number;
  narrative: DayNarrativeRole;
  companionType: PlanningInput["companionType"];
  hasRecoveryCandidate: boolean;
}): number {
  const { skeletonType, hardCap, narrative, companionType, hasRecoveryCandidate } = params;

  let target =
    skeletonType === "short"
      ? 2
      : skeletonType === "relaxed"
        ? 3
        : 4;

  if (companionType === "family") {
    target = Math.min(target, narrative === "peak" ? 4 : 3);
  }

  if (companionType === "couple" && narrative !== "peak") {
    target = Math.min(target, 3);
  }

  if (!hasRecoveryCandidate) {
    if (skeletonType === "short") {
      target = 2;
    } else if (narrative === "recovery") {
      target = 2;
    } else {
      target = Math.min(target, 3);
    }
  }

  return Math.min(target, hardCap);
}

function rankSupportForContract(params: {
  pool: PlannedExperience[];
  peakCandidate?: PlannedExperience;
  recoveryCandidate?: PlannedExperience;
  narrative: DayNarrativeRole;
}): PlannedExperience[] {
  const { pool, peakCandidate, recoveryCandidate, narrative } = params;

  return [...pool].sort((a, b) => {
    const getScore = (item: PlannedExperience) => {
      const sameAreaWithPeak =
        peakCandidate && item.experience.area === peakCandidate.experience.area ? 1.8 : 0;
      const sameClusterWithPeak =
        peakCandidate && item.themeCluster === peakCandidate.themeCluster ? 1.1 : 0;

      const sameAreaWithRecovery =
        recoveryCandidate && item.experience.area === recoveryCandidate.experience.area ? 0.9 : 0;

      const activationFriendly =
        !isRestLike(item.experience) && !item.experience.isMeal ? 1.0 : 0;

      const lighterBeforePeak =
        item.experience.fatigue <= 3 ? 0.7 : 0;

      const narrativeBonus =
        narrative === "peak" && !item.experience.isMeal && !isRestLike(item.experience)
          ? 0.4
          : 0;

      const penalty =
        item.experience.isMeal || isRestLike(item.experience) ? 0.5 : 0;

      return (
        item.planningScore +
        sameAreaWithPeak +
        sameClusterWithPeak +
        sameAreaWithRecovery +
        activationFriendly +
        lighterBeforePeak +
        narrativeBonus -
        penalty
      );
    };

    return getScore(b) - getScore(a);
  });
}

function compactDaySelection(params: {
  merged: PlannedExperience[];
  optionalPool: PlannedExperience[];
  primaryAreaPool: ScoredExperience[];
  spilloverPool: ScoredExperience[];
  skeletonType: DaySkeletonType;
  maxPerDay: number;
  narrative: DayNarrativeRole;
  companionType: PlanningInput["companionType"];
}): PlanningCompactSelectionResult {
  const {
    merged,
    optionalPool,
    primaryAreaPool,
    spilloverPool,
    skeletonType,
    maxPerDay,
    narrative,
    companionType,
  } = params;

  const hardCap = Math.min(getSkeletonHardCap(skeletonType), maxPerDay);

  const peakCandidate = [...merged]
    .filter((item) => isPeakCandidate(item.experience))
    .sort((a, b) => scorePeakForPlanning(b) - scorePeakForPlanning(a))[0];

  const recoverySelection = pickFeasibleRecoveryCandidate(
    merged,
    optionalPool,
    peakCandidate,
    narrative,
  );

  const recoveryCandidate = recoverySelection.candidate;

  const selectedBaseIds = new Set([
    ...merged.map((item) => item.experience.id),
    ...optionalPool.map((item) => item.experience.id),
  ]);

  const reserveLateFallbackPool = [...primaryAreaPool, ...spilloverPool]
    .filter((item) => !selectedBaseIds.has(item.experience.id))
    .map((item) =>
      toPlannedExperience(
        item,
        "optional",
        "optional",
        item.experience.isMeal
          ? "meal"
          : isRestLike(item.experience)
            ? "rest"
            : "optional",
        ["feasibility_safe", "diversity_fill"],
      ),
    );

  const lateFallbackIds = [...optionalPool, ...reserveLateFallbackPool]
    .filter((item) => item.experience.id !== peakCandidate?.experience.id)
    .filter((item) => item.experience.id !== recoveryCandidate?.experience.id)
    .filter((item) => canServeAsLateFallback(item.experience))
    .sort((a, b) => {
      const score = (item: PlannedExperience) => {
        const sameRecoveryArea =
          recoveryCandidate && item.experience.area === recoveryCandidate.experience.area ? 3 : 0;
        const samePeakArea =
          peakCandidate && item.experience.area === peakCandidate.experience.area ? 1.5 : 0;
        const sameRecoveryCluster =
          recoveryCandidate && item.themeCluster === recoveryCandidate.themeCluster ? 2 : 0;
        const samePeakCluster =
          peakCandidate && item.themeCluster === peakCandidate.themeCluster ? 1 : 0;
        const mealOrRest =
          (item.experience.isMeal ? 1.2 : 0) +
          (isRestLike(item.experience) ? 1.0 : 0) +
          (item.experience.timeFlexibility === "high"
            ? 0.6
            : item.experience.timeFlexibility === "medium"
              ? 0.3
              : 0);

        const narrativeBonus =
          (narrative === "peak" && item.experience.isMeal ? 0.8 : 0) +
          (narrative === "recovery" && isRestLike(item.experience) ? 0.8 : 0);

        return (
          item.planningScore +
          sameRecoveryArea +
          samePeakArea +
          sameRecoveryCluster +
          samePeakCluster +
          mealOrRest +
          narrativeBonus
        );
      };

      return score(b) - score(a);
    })
    .map((item) => item.experience.id)
    .filter((id, index, arr) => arr.indexOf(id) === index)
    .slice(0, narrative === "peak" ? 6 : 4);

  const targetItemCount = getTargetItemCount({
    skeletonType,
    hardCap,
    narrative,
    companionType,
    hasRecoveryCandidate: Boolean(recoveryCandidate),
  });

  const selected: PlannedExperience[] = [];
  const usedIds = new Set<string>();

  const pushItem = (item?: PlannedExperience) => {
    if (!item) return;
    if (usedIds.has(item.experience.id)) return;
    if (selected.length >= targetItemCount) return;
    usedIds.add(item.experience.id);
    selected.push(item);
  };

  const openerCandidate =
    narrative === "recovery"
      ? undefined
      : [...merged]
          .filter((item) => item.experience.id !== peakCandidate?.experience.id)
          .filter((item) => item.experience.id !== recoveryCandidate?.experience.id)
          .find((item) => isOpenerCandidate(item.experience));

  const supportPool = rankSupportForContract({
    pool: [...merged].filter(
      (item) =>
        item.experience.id !== peakCandidate?.experience.id &&
        item.experience.id !== recoveryCandidate?.experience.id &&
        item.experience.id !== openerCandidate?.experience.id,
    ),
    peakCandidate,
    recoveryCandidate,
    narrative,
  });

  const minSupportSlots =
    targetItemCount -
    (openerCandidate ? 1 : 0) -
    (peakCandidate ? 1 : 0) -
    (recoveryCandidate ? 1 : 0);

  if (openerCandidate) {
    pushItem(openerCandidate);
  }

  for (const item of supportPool.slice(0, Math.max(0, minSupportSlots))) {
    pushItem(item);
  }

  pushItem(peakCandidate);

  const additionalSupportPool = supportPool.filter(
    (item) => !usedIds.has(item.experience.id),
  );

  for (const item of additionalSupportPool) {
    if (selected.length >= Math.max(0, targetItemCount - (recoveryCandidate ? 1 : 0))) {
      break;
    }
    pushItem(item);
  }

  pushItem(recoveryCandidate);

  const trimmed = selected.slice(0, targetItemCount);

  const lateFallbackReserve = [...optionalPool, ...reserveLateFallbackPool].filter((item) =>
    lateFallbackIds.includes(item.experience.id),
  );

  return {
    items: trimmed,
    skeletonType,
    hardCap,
    targetItemCount,
    peakCandidate,
    recoveryCandidate,
    recoverySource: recoverySelection.source,
    recoveryScoreBreakdown: recoverySelection.scoreBreakdown,
    lateFallbackIds,
    lateFallbackReserve,
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

/**
 * =============================================================================
 * Planning Contract helpers (묶음 A — observation only)
 * =============================================================================
 *
 * 이 섹션의 함수들은 기존 선택 로직을 건드리지 않는다.
 * compactDaySelection()의 출력을 받아서 pins / timeBudget / suggestedFlow /
 * fallbackPool을 계산할 뿐이다.
 *
 * Phase B (structural backbone first)에서 이 함수들이 선택 파이프라인의 일부로
 * 승격된다. 지금은 scheduling에 더 풍부한 정보를 전달하는 역할만 한다.
 */

/**
 * 선택된 items 중 첫 opener 후보를 찾아 반환.
 * compactDaySelection이 narrative !== "recovery"일 때 opener를 먼저 push하지만
 * 그 참조를 유지하지 않으므로 사후 식별한다.
 */
function findOpenerInItems(
  items: PlannedExperience[],
  narrative: DayNarrativeRole,
): PlannedExperience | undefined {
  if (narrative === "recovery") return undefined;
  return items.find((item) => isOpenerCandidate(item.experience));
}

/**
 * compactDaySelection 결과로부터 structural pins를 만든다.
 * 묶음 A에서는 모두 confidence: "soft" — scheduling이 재검토할 수 있다.
 *
 * 묶음 B' update:
 * - opener가 peak 또는 recovery와 같은 experienceId면 opener pin을 생성하지 않는다.
 *   (같은 item이 두 role을 동시에 차지하면 suggestedFlow에 중복이 발생하고
 *    scheduling 쪽 해석도 모호해진다)
 */
function buildStructuralPins(params: {
  items: PlannedExperience[];
  peakCandidate?: PlannedExperience;
  recoveryCandidate?: PlannedExperience;
  narrative: DayNarrativeRole;
  skeletonType: DaySkeletonType;
}): DayPlan["pins"] {
  const {
    items,
    peakCandidate,
    recoveryCandidate,
    narrative,
    skeletonType,
  } = params;

  const peakId = peakCandidate?.experience.id;
  const recoveryId = recoveryCandidate?.experience.id;

  const openerItem = findOpenerInItems(items, narrative);
  const openerId = openerItem?.experience.id;

  const openerConflictsWithPeakOrRecovery =
    openerId !== undefined && (openerId === peakId || openerId === recoveryId);

  const peakConfidence: PinConfidence =
    skeletonType === "peak_centric" || narrative === "peak"
      ? "hard"
      : "soft";

  const recoveryConfidence: PinConfidence =
    skeletonType === "relaxed" ||
    narrative === "recovery" ||
    skeletonType === "balanced"
      ? "hard"
      : "soft";

  const openerConfidence: PinConfidence =
    narrative === "immersion" ? "soft" : "soft";

  const peak: StructuralPin | undefined = peakCandidate
    ? {
        experienceId: peakCandidate.experience.id,
        flowRole: "peak",
        confidence: peakConfidence,
      }
    : undefined;

  const recovery: StructuralPin | undefined = recoveryCandidate
    ? {
        experienceId: recoveryCandidate.experience.id,
        flowRole: "recovery",
        confidence: recoveryConfidence,
      }
    : undefined;

  const opener: StructuralPin | undefined =
    openerItem && !openerConflictsWithPeakOrRecovery
      ? {
          experienceId: openerItem.experience.id,
          flowRole: "opener",
          confidence: openerConfidence,
        }
      : undefined;

  return { peak, recovery, opener };
}

/**
 * flow-aware ordered sequence를 만든다.
 * canonical flow: [opener?] → pre-peak support → [peak] → post-peak support → [recovery?]
 *
 * 기존 buildRoughOrder()는 getOrderScore()로 time preference만 썼다.
 * 이 함수는 pins를 존중해서 narrative backbone을 먼저 고정한 뒤
 * 나머지 support items을 time preference로 정렬한다.
 */
/**
 * flow-aware ordered sequence를 만든다.
 *
 * 묶음 B' update — middle-biased peak positioning:
 * - scheduling 실측 결과, peak는 수열의 중앙 약간 앞 위치 (idx = floor((N-1)/2))
 *   가 가장 안정적이었다. 이전 버전처럼 peak를 뒤쪽에 놓으면
 *   scheduling이 일관되게 move_peak_earlier repair를 발동했다.
 * - 이 함수는 scheduling의 기대 위치에 맞춰 peak index를 계산한 뒤,
 *   [opener?, pre-peak support, peak, post-peak support, recovery?]
 *   구성을 그 기대 인덱스에 맞추도록 support 아이템 개수를 분배한다.
 *
 * Dedup:
 * - opener / peak / recovery pin이 서로 같은 experienceId 를 가질 수 있는
 *   edge case에서도 결과에 중복 ID가 나오지 않도록 Set으로 마지막에 걸러낸다.
 */
function getMiddleBiasedPeakIndex(totalCount: number): number {
  if (totalCount <= 1) return 0;
  return Math.max(1, Math.floor((totalCount - 1) / 2));
}

function buildSuggestedFlow(
  items: PlannedExperience[],
  pins: DayPlan["pins"],
): string[] {
  const peakId = pins?.peak?.experienceId;
  const recoveryId = pins?.recovery?.experienceId;
  const openerId = pins?.opener?.experienceId;

  const peakItem = items.find((x) => x.experience.id === peakId);
  const recoveryItem = items.find((x) => x.experience.id === recoveryId);
  const openerItem = items.find((x) => x.experience.id === openerId);

  const excludeIds = new Set<string>(
    [peakId, recoveryId, openerId].filter((x): x is string => Boolean(x)),
  );

  const support = items
    .filter((x) => !excludeIds.has(x.experience.id))
    .sort((a, b) => {
      const aScore =
        getOrderScore(a) +
        (peakItem && a.experience.area === peakItem.experience.area ? 10 : 0) +
        (peakItem && a.themeCluster === peakItem.themeCluster ? 6 : 0) -
        (a.experience.isMeal || isRestLike(a.experience) ? 8 : 0);

      const bScore =
        getOrderScore(b) +
        (peakItem && b.experience.area === peakItem.experience.area ? 10 : 0) +
        (peakItem && b.themeCluster === peakItem.themeCluster ? 6 : 0) -
        (b.experience.isMeal || isRestLike(b.experience) ? 8 : 0);

      return aScore - bScore;
    });

  const flow: PlannedExperience[] = [];

  if (openerItem) {
    flow.push(openerItem);
  }

  if (support.length === 0) {
    if (peakItem) flow.push(peakItem);
    if (recoveryItem) flow.push(recoveryItem);
  } else {
    const peakInsertIndex = getMiddleBiasedPeakIndex(
      support.length + (openerItem ? 1 : 0) + (peakItem ? 1 : 0),
    );

    const currentLeadCount = openerItem ? 1 : 0;
    const prePeakSupportCount = Math.max(
      0,
      Math.min(support.length, peakInsertIndex - currentLeadCount),
    );

    const prePeakSupport = support.slice(0, prePeakSupportCount);
    const postPeakSupport = support.slice(prePeakSupportCount);

    flow.push(...prePeakSupport);
    if (peakItem) flow.push(peakItem);
    flow.push(...postPeakSupport);
    if (recoveryItem) flow.push(recoveryItem);
  }

  const seenIds = new Set<string>();
  const dedupedFlow: string[] = [];

  for (const item of flow) {
    const id = item.experience.id;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    dedupedFlow.push(id);
  }

  if (recoveryId && dedupedFlow.includes(recoveryId)) {
    const withoutRecovery = dedupedFlow.filter((id) => id !== recoveryId);
    return [...withoutRecovery, recoveryId];
  }

  return dedupedFlow;
}
/**
 * planning 시점의 time budget 추정.
 * scheduling의 precise timeline fit 전 pre-check 용도.
 *
 * 묶음 A에서는 isFeasible 값이 diagnostics에 기록되기만 하고
 * 선택된 items는 건드리지 않는다. Phase B에서 trimToTimeBudget()로 발전.
 */
function computePlanningTimeBudget(
  items: PlannedExperience[],
  input: PlanningInput,
): PlanningTimeBudget {
  const availableMin = Math.max(0, (input.dailyEndSlot - input.dailyStartSlot) * 30);
  const experienceMin = items.reduce(
    (sum, item) => sum + item.experience.recommendedDuration,
    0,
  );
  const travelMin = estimateTravelMinutes(items);
  const estimatedTotalMin = experienceMin + travelMin;
  const bufferMin = availableMin - estimatedTotalMin;
  const isFeasible = estimatedTotalMin <= availableMin * 1.05;
  const overEstimatedMin = Math.max(0, estimatedTotalMin - availableMin);

  return {
    estimatedTotalMin,
    availableMin,
    bufferMin,
    isFeasible,
    overEstimatedMin,
  };
}

/**
 * lateFallbackReserve를 우선순위 정렬된 FallbackEntry[]로 변환한다.
 * compactDaySelection이 이미 정렬 수행했으므로 순서는 유지.
 */
function buildFallbackPool(
  lateFallbackReserve: PlannedExperience[] | undefined,
): FallbackEntry[] {
  if (!lateFallbackReserve || lateFallbackReserve.length === 0) return [];

  return lateFallbackReserve.map((item) => {
    const exp = item.experience;
    const preferredPosition: FallbackEntry["preferredPosition"] =
      exp.isMeal || isRestLike(exp) ? "post_peak" : "any";

    return {
      experienceId: exp.id,
      planningScore: item.planningScore,
      functionalRole: item.functionalRole,
      preferredPosition,
    };
  });
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
      primaryAreaPool,
      spilloverPool,
      skeletonType,
      maxPerDay: densityMaxPerDay,
      narrative: dayNarrative,
      companionType: input.companionType,
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

    // =========================================================================
    // Planning Contract (묶음 A — observation only)
    // 기존 선택 로직 결과를 받아서 pins / timeBudget / suggestedFlow /
    // fallbackPool 을 계산한다. 선택된 items는 변경하지 않는다.
    // =========================================================================
    const contractPins = buildStructuralPins({
      items: compact.items,
      peakCandidate: compact.peakCandidate,
      recoveryCandidate: compact.recoveryCandidate,
      narrative: dayNarrative,
      skeletonType: compact.skeletonType,
    });

    const suggestedFlow = buildSuggestedFlow(compact.items, contractPins);

    // suggestedFlow 순서대로 items를 재정렬해서 budget을 계산한다.
    // (travel minutes는 순서에 의존하므로 실제 scheduling이 쓸 순서로 추정해야 정확함)
    const flowOrderedItems = suggestedFlow
      .map((id) => compact.items.find((x) => x.experience.id === id))
      .filter((x): x is PlannedExperience => x !== undefined);

    const contractTimeBudget = computePlanningTimeBudget(flowOrderedItems, input);
    const contractFallbackPool = buildFallbackPool(compact.lateFallbackReserve);

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
        `recoverySource=${compact.recoverySource}`,
        `recoveryScore=${compact.recoveryScoreBreakdown}`,
        `spareCapacity=${compact.spareCapacity}`,
        // PlanningContract observation (묶음 A)
        `contractOpenerPin=${contractPins?.opener?.experienceId ?? "none"}`,
        `contractPeakPin=${contractPins?.peak?.experienceId ?? "none"}`,
        `contractRecoveryPin=${contractPins?.recovery?.experienceId ?? "none"}`,
        `budgetFeasible=${contractTimeBudget.isFeasible}`,
        `budgetEstimated=${contractTimeBudget.estimatedTotalMin}`,
        `budgetAvailable=${contractTimeBudget.availableMin}`,
        `budgetBuffer=${contractTimeBudget.bufferMin}`,
        `budgetOverflow=${contractTimeBudget.overEstimatedMin}`,
        `suggestedFlow=${suggestedFlow.join("->")}`,
        `fallbackPoolSize=${contractFallbackPool.length}`,
      ],
    });

        dayPlans.push({
      day,
      areas: getAreasFromMerged(compact.items),
      anchor: finalAnchor,
      core: finalCore,
      optional: finalOptional,
      roughOrder,
      lateFallbackReserve: compact.lateFallbackReserve,
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
      // PlanningContract fields (묶음 A)
      pins: contractPins,
      timeBudget: contractTimeBudget,
      suggestedFlow,
      fallbackPool: contractFallbackPool,
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
