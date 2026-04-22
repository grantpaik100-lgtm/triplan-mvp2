/**
 * TriPlan V3
 * Current Role:
 * - planning 결과를 실제 하루 일정으로 배치하는 scheduling engine file이다.
 *
 * Target Role:
 * - slot-first 배치기가 아니라 sequence-first Experience Flow Engine이어야 한다.
 *
 * Chain:
 * - engine
 *
 * Inputs:
 * - DayPlan
 * - PlanningInput
 * - day index / total days
 *
 * Outputs:
 * - day schedule
 * - scheduling diagnostics
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
 * - Scheduling V3는 experience sequence를 먼저 만들고,
 *   그 다음 order-preserving 방식으로 timeline fitting을 수행한다.
 * - recovery는 hard-fail이 아니라 soft-protected 대상으로 취급한다.
 * - peak는 day middle에 위치하도록 sequence와 fitting 단계에서 모두 보호한다.
 */

import { getAreaDistanceMinutes } from "./area";
import { getPreferredStartSlot, isAllowedTimeSlot, minutesToSlots } from "./time";
import type {
  DayNarrativeType,
  DayPlan,
  DaySchedule,
  DaySchedulingDiagnostic,
  DaySkeletonType,
  ExperienceMetadata,
  ExperienceSequenceNode,
  FeasibilityReport,
  FeasibilityStatus,
  FlowRole,
  FlowRoleAffinity,
  PlannedExperience,
  PlanningInput,
  RepairActionLog,
  RhythmSlotType,
  ScheduleIssue,
  ScheduledItem,
  SequenceDiagnostics,
  TimelineDiagnostics,
} from "./types";

type SequenceBuildResult = {
  skeletonType: DaySkeletonType;
  ordered: PlannedExperience[];
  nodes: ExperienceSequenceNode[];
  primaryPeak?: PlannedExperience;
  primaryRecovery?: PlannedExperience;
  notes: string[];
};

type SequenceEvaluation = {
  flowScore: number;
  smoothnessScore: number;
  fatigueScore: number;
  peakPositionScore: number;
  recoveryScore: number;
  continuityScore: number;
  notes: string[];
};

type TimelineFitResult = {
  items: ScheduledItem[];
  invalidPlacement: boolean;
  droppedOptionalIds: string[];
  compressedExperienceIds: string[];
  notes: string[];
};

type RepairResult = {
  items: ScheduledItem[];
  repairs: RepairActionLog[];
  timelineDiagnostics: TimelineDiagnostics;
};

const MAX_FATIGUE_SAFE = 15;
const DEFAULT_TRANSITION_MIN = 30;

function flattenDayPlan(dayPlan: DayPlan): PlannedExperience[] {
  const plannedOrder =
    dayPlan.suggestedFlow ??
    dayPlan.selection?.selectedOrder ??
    dayPlan.roughOrder;
  const orderMap = new Map(plannedOrder.map((id, idx) => [id, idx]));

  return [...dayPlan.anchor, ...dayPlan.core, ...dayPlan.optional].sort((a, b) => {
    return (orderMap.get(a.experience.id) ?? 999) - (orderMap.get(b.experience.id) ?? 999);
  });
}

export function estimateTravelMinutes(items: PlannedExperience[]): number {
  if (items.length <= 1) return 0;

  let total = 0;
  for (let i = 1; i < items.length; i += 1) {
    total += getAreaDistanceMinutes(items[i - 1].experience.area, items[i].experience.area);
  }
  return total;
}

function estimatePlannedMinutes(items: PlannedExperience[]): number {
  const experienceMinutes = items.reduce(
    (sum, item) => sum + item.experience.recommendedDuration,
    0,
  );

  return experienceMinutes + estimateTravelMinutes(items);
}

function toFeasibilityStatus(overflowMin: number): FeasibilityStatus {
  if (overflowMin <= 0) return "safe";
  if (overflowMin <= 60) return "tight";
  return "overflow";
}

function toNarrativeType(skeletonType: DaySkeletonType): DayNarrativeType {
  if (skeletonType === "relaxed") return "recovery";
  if (skeletonType === "peak_centric") return "peak";
  return "immersion";
}

function flowRoleToRhythmSlotType(role: FlowRole): RhythmSlotType {
  switch (role) {
    case "opener":
      return "warm_up";
    case "activation":
    case "support":
      return "activation";
    case "peak":
      return "emotional_peak";
    case "recovery":
      return "recovery";
    case "soft_end":
      return "cool_down";
    default:
      return "activation";
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function safeAllowedTimes(exp: ExperienceMetadata): ExperienceMetadata["allowedTimes"] {
  return Array.isArray(exp.allowedTimes) ? exp.allowedTimes : [];
}

function computeAvailableMinutes(input: PlanningInput): number {
  return Math.max(0, (input.dailyEndSlot - input.dailyStartSlot) * 30);
}

function hasStrongAnchor(items: PlannedExperience[]): boolean {
  return items.some((item) => {
    const tags = item.selectionReason?.tags ?? [];
    return (
      item.priority === "anchor" ||
      tags.includes("must_place") ||
      tags.includes("must_experience") ||
      item.experience.priorityHints.canBeAnchor
    );
  });
}

function estimateFeasibleSequenceCapacity(
  items: PlannedExperience[],
  input: PlanningInput,
): number {
  const availableMin = computeAvailableMinutes(input);

  const avgDuration =
    items.length > 0
      ? items.reduce((sum, item) => sum + item.experience.recommendedDuration, 0) / items.length
      : 90;

  const constrainedCount = items.filter((item) => {
    const allowed = safeAllowedTimes(item.experience);
    return (
      allowed.length > 0 &&
      !allowed.includes("afternoon") &&
      !allowed.includes("dinner")
    );
  }).length;

  const flexibilityBonus =
    items.filter((item) => item.experience.timeFlexibility === "high").length * 10;

  const roughCapacity = Math.floor((availableMin + flexibilityBonus) / Math.max(75, avgDuration));
  const constrainedPenalty = Math.floor(constrainedCount / 2);

  return Math.max(2, roughCapacity - constrainedPenalty);
}

function selectDaySkeleton(params: {
  items: PlannedExperience[];
  input: PlanningInput;
  dayIndex: number;
  totalDays: number;
}): DaySkeletonType {
  const { items, input, dayIndex, totalDays } = params;

  const availableMin = computeAvailableMinutes(input);
  const candidateCount = items.length;
  const quietBias =
    items.reduce((sum, item) => sum + item.experience.features.quiet, 0) /
    Math.max(1, items.length);
  const feasibleCapacity = estimateFeasibleSequenceCapacity(items, input);

  if (availableMin <= 300 || candidateCount <= 3 || feasibleCapacity <= 3) {
    return "short";
  }

  if (input.dailyDensity >= 4 && candidateCount >= 5 && feasibleCapacity >= 5) {
    return "extended";
  }

  if (hasStrongAnchor(items) && dayIndex > 0 && dayIndex < totalDays - 1) {
    return "peak_centric";
  }

  if (quietBias >= 0.62 || (dayIndex === totalDays - 1 && input.dailyDensity <= 3)) {
    return "relaxed";
  }

  return "balanced";
}

function isRecoveryCandidate(item: PlannedExperience): boolean {
  const placeType = (item.experience.placeType ?? "").toLowerCase();

  return (
    item.functionalRole === "rest" ||
    item.functionalRole === "transition_safe" ||
    placeType.includes("cafe") ||
    item.experience.features.quiet >= 0.6 ||
    item.themeCluster === "cafe_relax" ||
    item.themeCluster === "walk_local" ||
    item.themeCluster === "nature_scenery"
  );
}

function isOpenerCandidate(item: PlannedExperience): boolean {
  const allowed = safeAllowedTimes(item.experience);

  const earlyFriendly =
    allowed.length === 0 ||
    allowed.includes("morning") ||
    allowed.includes("late_morning") ||
    allowed.includes("lunch") ||
    allowed.includes("afternoon");

  return earlyFriendly && item.experience.fatigue <= 3;
}

function isPeakLikeCandidate(item: PlannedExperience): boolean {
  if (item.priority === "anchor") return true;
  if (item.themeCluster === "night_view") return true;
  if (item.functionalRole === "viewpoint") return true;
  if (item.experience.preferredTime === "sunset") return true;
  if (item.experience.preferredTime === "night") return true;

  return item.planningScore >= 70;
}

function computeFlowRoleAffinity(item: PlannedExperience): FlowRoleAffinity {
  const exp = item.experience;
  const allowed = safeAllowedTimes(exp);
  const quiet = clamp01(exp.features.quiet);
  const activity = clamp01(exp.features.activityIntensity);
  const romantic = clamp01(exp.features.romantic);
  const local = clamp01(exp.features.local);
  const fatiguePenalty = exp.fatigue / 5;

  const opener =
    (isOpenerCandidate(item) ? 0.45 : 0.15) +
    (1 - fatiguePenalty) * 0.25 +
    quiet * 0.2 +
    (allowed.includes("morning") || allowed.includes("late_morning") || allowed.length === 0
      ? 0.1
      : 0);

  const activation =
    0.2 +
    activity * 0.35 +
    local * 0.15 +
    (item.priority === "anchor" ? 0.1 : 0) +
    (exp.isMeal ? 0.05 : 0);

  const support =
    0.2 +
    clamp01(exp.features.shopping) * 0.15 +
    clamp01(exp.features.culture) * 0.15 +
    local * 0.1 +
    (exp.isMeal ? 0.15 : 0.05) +
    (item.priority === "optional" ? 0.1 : 0);

  const peak =
    (item.priority === "anchor" ? 0.35 : 0.15) +
    (isPeakLikeCandidate(item) ? 0.25 : 0.05) +
    activity * 0.15 +
    romantic * 0.1 +
    (exp.preferredTime === "sunset" ? 0.1 : 0) +
    (exp.preferredTime === "night" ? 0.08 : 0) +
    (item.functionalRole === "viewpoint" ? 0.1 : 0);

  const recovery =
    (isRecoveryCandidate(item) ? 0.4 : 0.1) +
    quiet * 0.25 +
    (1 - fatiguePenalty) * 0.15 +
    (exp.isMeal ? 0.1 : 0.05) +
    (allowed.includes("dinner") || allowed.includes("night") || allowed.length === 0
      ? 0.1
      : 0);

  const softEnd =
    (isRecoveryCandidate(item) ? 0.35 : 0.1) +
    quiet * 0.2 +
    (exp.isNightFriendly ? 0.15 : 0.05) +
    romantic * 0.1 +
    (allowed.includes("night") || allowed.length === 0 ? 0.15 : 0);

  return {
    opener: clamp01(opener),
    activation: clamp01(activation),
    support: clamp01(support),
    peak: clamp01(peak),
    recovery: clamp01(recovery),
    softEnd: clamp01(softEnd),
  };
}

function getAdjacencyCompatibility(prev: PlannedExperience, next: PlannedExperience): number {
  const travel = getAreaDistanceMinutes(prev.experience.area, next.experience.area);
  const fatigueGap = Math.abs(prev.experience.fatigue - next.experience.fatigue);
  const sameCluster =
    prev.themeCluster && next.themeCluster && prev.themeCluster === next.themeCluster ? 1 : 0;

  let score = 1;
  score -= Math.min(0.45, travel / 120);
  score -= fatigueGap * 0.08;
  score += sameCluster ? 0.12 : 0;

  return clamp01(score);
}

function getMiddleTimeCompatibility(item: PlannedExperience, input: PlanningInput): number {
  const preferred = getPreferredStartSlot(item.experience.preferredTime);
  const middle = Math.floor((input.dailyStartSlot + input.dailyEndSlot) / 2);
  const gap = Math.abs(preferred - middle);

  const allowed = safeAllowedTimes(item.experience);
  const middleAllowed =
    allowed.length === 0 ||
    isAllowedTimeSlot(allowed, middle) ||
    isAllowedTimeSlot(allowed, middle - 1) ||
    isAllowedTimeSlot(allowed, middle + 1);

  let score = Math.max(0, 1 - gap / 16);
  if (middleAllowed) score += 0.2;

  return clamp01(score);
}

function selectPeak(items: PlannedExperience[], input: PlanningInput): PlannedExperience | undefined {
  if (items.length === 0) return undefined;

  return [...items]
    .map((item) => {
      const affinity = computeFlowRoleAffinity(item);
      const middleFit = getMiddleTimeCompatibility(item, input);
      const tags = item.selectionReason?.tags ?? [];

      const score =
        item.planningScore * 0.35 +
        affinity.peak * 0.25 +
        middleFit * 0.15 +
        (item.priority === "anchor" ? 0.1 : 0) +
        (tags.includes("must_place") || tags.includes("must_experience") ? 0.1 : 0) +
        (item.experience.isNightFriendly ? 0.05 : 0);

      return { item, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.item;
}

function selectRecovery(
  items: PlannedExperience[],
  peak: PlannedExperience | undefined,
): PlannedExperience | undefined {
  if (items.length === 0) return undefined;

  const peakArea = peak?.experience.area;

  return [...items]
    .filter((item) => item.experience.id !== peak?.experience.id)
    .map((item) => {
      const affinity = computeFlowRoleAffinity(item);
      const proximity = peakArea
        ? clamp01(1 - getAreaDistanceMinutes(peakArea, item.experience.area) / 120)
        : 0.5;

      const score =
        affinity.recovery * 0.45 +
        affinity.softEnd * 0.15 +
        proximity * 0.2 +
        (item.experience.timeFlexibility === "high"
          ? 0.1
          : item.experience.timeFlexibility === "medium"
            ? 0.05
            : 0) +
        (item.experience.fatigue <= 3 ? 0.1 : 0);

      return { item, score };
    })
    .sort((a, b) => b.score - a.score)[0]?.item;
}

function selectBestByRole(params: {
  items: PlannedExperience[];
  usedIds: Set<string>;
  role: Exclude<FlowRole, "peak">;
  prev?: PlannedExperience;
  next?: PlannedExperience;
}): PlannedExperience | undefined {
  const { items, usedIds, role, prev, next } = params;

  return [...items]
    .filter((item) => !usedIds.has(item.experience.id))
    .map((item) => {
      const affinity = computeFlowRoleAffinity(item);

      const roleScore =
        role === "opener"
          ? affinity.opener
          : role === "activation"
            ? affinity.activation
            : role === "support"
              ? affinity.support
              : role === "recovery"
                ? affinity.recovery
                : affinity.softEnd;

      let adjacencyScore = 0.5;
      if (prev) adjacencyScore = (adjacencyScore + getAdjacencyCompatibility(prev, item)) / 2;
      if (next) adjacencyScore = (adjacencyScore + getAdjacencyCompatibility(item, next)) / 2;

      const total = roleScore * 0.55 + adjacencyScore * 0.25 + item.planningScore * 0.2;
      return { item, score: total };
    })
    .sort((a, b) => b.score - a.score)[0]?.item;
}

function buildSkeletonRoles(skeletonType: DaySkeletonType): FlowRole[] {
  switch (skeletonType) {
    case "short":
      return ["opener", "peak", "recovery"];
    case "extended":
      return ["opener", "activation", "support", "peak", "recovery"];
    case "peak_centric":
      return ["opener", "support", "peak", "recovery"];
    case "relaxed":
      return ["opener", "activation", "recovery", "soft_end"];
    case "balanced":
    default:
      return ["opener", "activation", "peak", "recovery"];
  }
}

function localOptimizeSequence(
  ordered: PlannedExperience[],
  peakId?: string,
): PlannedExperience[] {
  if (ordered.length <= 3) return ordered;

  const optimized = [...ordered];
  const peakIndex = peakId
    ? optimized.findIndex((item) => item.experience.id === peakId)
    : -1;

  if (peakIndex > 0 && peakIndex === optimized.length - 1) {
    const [peak] = optimized.splice(peakIndex, 1);
    optimized.splice(Math.max(1, optimized.length - 1), 0, peak);
  }

  for (let i = 1; i < optimized.length - 1; i += 1) {
    const prev = optimized[i - 1];
    const current = optimized[i];
    const next = optimized[i + 1];

    if (
      prev.experience.fatigue >= 4 &&
      current.experience.fatigue >= 4 &&
      next.experience.fatigue <= 3
    ) {
      optimized[i] = next;
      optimized[i + 1] = current;
    }
  }

  return optimized;
}

function buildExperienceSequence(params: {
  dayPlan: DayPlan;
  items: PlannedExperience[];
  input: PlanningInput;
  dayIndex: number;
  totalDays: number;
}): SequenceBuildResult {
  const { dayPlan, items, input, dayIndex, totalDays } = params;

  const planningSkeleton = dayPlan.selection?.skeletonType;
  const planningPeakId = dayPlan.selection?.peakCandidateId;
  const planningRecoveryId = dayPlan.selection?.recoveryCandidateId;

  const skeletonType =
    planningSkeleton ??
    selectDaySkeleton({
      items,
      input,
      dayIndex,
      totalDays,
    });

  const skeletonRoles = buildSkeletonRoles(skeletonType);
  const peak =
    items.find((item) => item.experience.id === planningPeakId) ??
    selectPeak(items, input);

  // Bug Fix: planningRecoveryId가 없거나 items에 없으면 selectRecovery()로 fallback.
  // 이전 코드는 planningRecoveryId가 없을 때 undefined를 반환해 primaryRecovery=undefined가
  // 되었고, evaluateSequenceFlow가 "missing_recovery"를 잘못 발생시켰다.
  const explicitRecovery = planningRecoveryId
    ? items.find((item) => item.experience.id === planningRecoveryId)
    : undefined;
  const recovery = explicitRecovery ?? selectRecovery(items, peak);

  const usedIds = new Set<string>();
  const orderedByRole: Array<{ role: FlowRole; item: PlannedExperience }> = [];

  if (peak) usedIds.add(peak.experience.id);
  if (recovery) usedIds.add(recovery.experience.id);

  for (const role of skeletonRoles) {
    if (role === "peak") {
      if (peak) {
        orderedByRole.push({ role: "peak", item: peak });
      }
      continue;
    }

    if (role === "recovery") {
      if (recovery) {
        orderedByRole.push({ role: "recovery", item: recovery });
      }
      continue;
    }

    const prev = orderedByRole[orderedByRole.length - 1]?.item;
    const next =
      role === "opener" || role === "activation" || role === "support"
        ? peak
        : undefined;

    const picked = selectBestByRole({
      items,
      usedIds,
      role,
      prev,
      next,
    });

    if (picked) {
      usedIds.add(picked.experience.id);
      orderedByRole.push({ role, item: picked });
    }
  }

  const seen = new Set<string>();
  let ordered = orderedByRole
    .filter(({ item }) => {
      if (seen.has(item.experience.id)) return false;
      seen.add(item.experience.id);
      return true;
    })
    .map((entry) => entry.item);

  if (peak && !ordered.some((x) => x.experience.id === peak.experience.id)) {
    const insertAt = Math.max(1, Math.floor(ordered.length / 2));
    ordered.splice(insertAt, 0, peak);
  }

  if (recovery && !ordered.some((x) => x.experience.id === recovery.experience.id)) {
    ordered.push(recovery);
  }

  ordered = localOptimizeSequence(ordered, peak?.experience.id);

  const nodeRoleMap = new Map<string, FlowRole>();
  for (const entry of orderedByRole) {
    nodeRoleMap.set(entry.item.experience.id, entry.role);
  }
  if (peak) nodeRoleMap.set(peak.experience.id, "peak");
  if (recovery) {
    nodeRoleMap.set(
      recovery.experience.id,
      skeletonType === "relaxed" ? "soft_end" : "recovery",
    );
  }

  const nodes: ExperienceSequenceNode[] = ordered.map((item, index) => ({
    experienceId: item.experience.id,
    placeName: item.experience.placeName,
    priority: item.priority,
    planningTier: item.planningTier,
    functionalRole: item.functionalRole,
    themeCluster: item.themeCluster,
    flowRole:
      nodeRoleMap.get(item.experience.id) ??
      (index === 0 ? "opener" : index === ordered.length - 1 ? "recovery" : "support"),
    sequenceIndex: index,
    isPrimaryPeak: item.experience.id === peak?.experience.id,
    roleAffinity: computeFlowRoleAffinity(item),
  }));

  return {
    skeletonType,
    ordered,
    nodes,
    primaryPeak: peak,
    primaryRecovery: recovery,
    notes: [
      `skeleton=${skeletonType}`,
      `sequenceCount=${ordered.length}`,
      `peak=${peak?.experience.id ?? "none"}`,
      `recovery=${recovery?.experience.id ?? "none"}`,
      `planningSkeleton=${planningSkeleton ?? "none"}`,
      `planningPeak=${planningPeakId ?? "none"}`,
      `planningRecovery=${planningRecoveryId ?? "none"}`,
    ],
  };
}

function evaluateSequenceFlow(params: {
  ordered: PlannedExperience[];
  nodes: ExperienceSequenceNode[];
  skeletonType: DaySkeletonType;
  input: PlanningInput;
  primaryPeak?: PlannedExperience;
  primaryRecovery?: PlannedExperience;
}): SequenceEvaluation {
  const { ordered, nodes, primaryPeak, primaryRecovery } = params;

  let smoothnessScore = 0;
  let fatigueScore = 0;
  let peakPositionScore = 0;
  let recoveryScore = 0;
  let continuityScore = 0;
  const notes: string[] = [];

  if (ordered.length === 0) {
    return {
      flowScore: 0,
      smoothnessScore: 0,
      fatigueScore: 0,
      peakPositionScore: 0,
      recoveryScore: 0,
      continuityScore: 0,
      notes: ["empty_sequence"],
    };
  }

  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const current = ordered[i];

    smoothnessScore += getAdjacencyCompatibility(prev, current);

    const fatigueDelta = current.experience.fatigue - prev.experience.fatigue;
    if (i < ordered.length - 1) {
      fatigueScore += fatigueDelta <= 2 ? 0.7 : 0.2;
    } else {
      fatigueScore += fatigueDelta <= 0 ? 0.8 : 0.2;
    }

    continuityScore += prev.themeCluster !== current.themeCluster ? 0.5 : 0.8;
  }

  const peakIndex = primaryPeak
    ? ordered.findIndex((x) => x.experience.id === primaryPeak.experience.id)
    : -1;

  if (peakIndex >= 0) {
    const target = Math.floor(ordered.length / 2);
    const gap = Math.abs(peakIndex - target);
    peakPositionScore = Math.max(0, 1 - gap / Math.max(1, ordered.length / 2));
    notes.push(`peakIndex=${peakIndex}`);
  } else {
    notes.push("missing_peak");
  }

  const recoveryIndex = primaryRecovery
    ? ordered.findIndex((x) => x.experience.id === primaryRecovery.experience.id)
    : -1;

  if (recoveryIndex >= 0 && primaryRecovery) {
    const peakFatigue = primaryPeak?.experience.fatigue ?? 5;
    const recoveryFatigue = primaryRecovery.experience.fatigue;
    const afterPeak =
      peakIndex >= 0 ? recoveryIndex > peakIndex : recoveryIndex === ordered.length - 1;

    recoveryScore =
      (afterPeak ? 0.5 : 0) +
      (recoveryFatigue <= peakFatigue ? 0.3 : 0) +
      (isRecoveryCandidate(primaryRecovery) ? 0.2 : 0);

    notes.push(`recoveryIndex=${recoveryIndex}`);
  } else {
    notes.push("missing_recovery");
  }

  if (nodes[0]?.flowRole === "opener") continuityScore += 0.4;
  const lastRole = nodes[nodes.length - 1]?.flowRole;
  if (lastRole === "recovery" || lastRole === "soft_end") {
    continuityScore += 0.4;
  }

  const normalizedSmooth = ordered.length > 1 ? smoothnessScore / (ordered.length - 1) : 0.8;
  const normalizedFatigue = ordered.length > 1 ? fatigueScore / (ordered.length - 1) : 0.8;
  const normalizedContinuity =
    ordered.length > 1 ? continuityScore / (ordered.length - 1) : continuityScore;

  const flowScore =
    normalizedSmooth * 30 +
    normalizedFatigue * 25 +
    peakPositionScore * 25 +
    recoveryScore * 20 +
    normalizedContinuity * 10;

  return {
    flowScore,
    smoothnessScore: normalizedSmooth,
    fatigueScore: normalizedFatigue,
    peakPositionScore,
    recoveryScore,
    continuityScore: normalizedContinuity,
    notes,
  };
}

function getRoleForItem(
  item: PlannedExperience,
  sequenceNodes: ExperienceSequenceNode[],
): FlowRole {
  return (
    sequenceNodes.find((node) => node.experienceId === item.experience.id)?.flowRole ?? "support"
  );
}

function isCriticalFlowRole(role: FlowRole): boolean {
  return role === "peak";
}

function isProtectedFlowRole(role: FlowRole): boolean {
  return role === "peak" || role === "recovery" || role === "soft_end";
}

function chooseDurationMinutes(
  item: PlannedExperience,
  overflowPressureMin: number,
): number {
  const recommended = item.experience.recommendedDuration;
  const min = item.experience.minDuration;

  if (overflowPressureMin <= 0) return recommended;
  if (item.priority === "optional") return Math.max(min, recommended - 30);
  if (item.functionalRole === "rest" || item.experience.isMeal) {
    return Math.max(min, recommended - 30);
  }

  return recommended;
}

function getTimeWindowToleranceSlots(
  exp: ExperienceMetadata,
  flowRole?: FlowRole,
): number {
  if (flowRole === "recovery" || flowRole === "soft_end") {
    if (exp.timeFlexibility === "high") return 2;
    return 1;
  }

  if (exp.timeFlexibility === "high") return 1;
  return 0;
}

function isAllowedWithTolerance(
  exp: ExperienceMetadata,
  startSlot: number,
  flowRole?: FlowRole,
): boolean {
  if (isAllowedTimeSlot(exp.allowedTimes, startSlot)) {
    return true;
  }

  const tolerance = getTimeWindowToleranceSlots(exp, flowRole);
  if (tolerance > 0) {
    for (let delta = 1; delta <= tolerance; delta += 1) {
      if (
        isAllowedTimeSlot(exp.allowedTimes, startSlot - delta) ||
        isAllowedTimeSlot(exp.allowedTimes, startSlot + delta)
      ) {
        return true;
      }
    }
  }

  const allowed = safeAllowedTimes(exp);

  if (allowed.length === 0) {
    return true;
  }

  // soft policy:
  // peak / recovery / soft_end는 flow 보호를 위해 wider acceptance 허용
  if (
    flowRole === "peak" ||
    flowRole === "recovery" ||
    flowRole === "soft_end"
  ) {
    return true;
  }

  // high flexibility는 time window miss를 허용
  if (exp.timeFlexibility === "high") {
    return true;
  }

  // medium flexibility + meal 은 실사용 맥락상 어느 정도 허용
  if (exp.timeFlexibility === "medium" && exp.isMeal) {
    return true;
  }

  return false;
}

function findFeasibleStartSlot(params: {
  item: PlannedExperience;
  earliestSlot: number;
  latestStartSlot: number;
}): number | null {
  const { item, earliestSlot, latestStartSlot } = params;
  if (earliestSlot > latestStartSlot) return null;

  const preferred = getPreferredStartSlot(item.experience.preferredTime);
  const candidates: number[] = [];

  for (let slot = earliestSlot; slot <= latestStartSlot; slot += 1) {
    if (isAllowedTimeSlot(item.experience.allowedTimes, slot)) {
      candidates.push(slot);
    }
  }

  if (candidates.length === 0) return null;

  return [...candidates].sort((a, b) => {
    const aGap = Math.abs(a - preferred);
    const bGap = Math.abs(b - preferred);
    return aGap - bGap;
  })[0];
}

function findLatestAllowedStartSlot(params: {
  item: PlannedExperience;
  earliestSlot: number;
  latestStartSlot: number;
}): number | null {
  const { item, earliestSlot, latestStartSlot } = params;
  if (earliestSlot > latestStartSlot) return null;

  for (let slot = latestStartSlot; slot >= earliestSlot; slot -= 1) {
    if (isAllowedTimeSlot(item.experience.allowedTimes, slot)) {
      return slot;
    }
  }

  return null;
}

function findFallbackStartSlot(params: {
  item: PlannedExperience;
  earliestSlot: number;
  latestStartSlot: number;
}): number | null {
  const { item, earliestSlot, latestStartSlot } = params;
  if (earliestSlot > latestStartSlot) return null;

  for (let slot = earliestSlot; slot <= latestStartSlot; slot += 1) {
    if (isAllowedTimeSlot(item.experience.allowedTimes, slot)) {
      return slot;
    }
  }

  if (item.experience.timeFlexibility === "high") {
    return Math.min(earliestSlot, latestStartSlot);
  }

  return null;
}

function findLatestFallbackStartSlot(params: {
  item: PlannedExperience;
  earliestSlot: number;
  latestStartSlot: number;
}): number | null {
  const { item, earliestSlot, latestStartSlot } = params;
  if (earliestSlot > latestStartSlot) return null;

  for (let slot = latestStartSlot; slot >= earliestSlot; slot -= 1) {
    if (isAllowedTimeSlot(item.experience.allowedTimes, slot)) {
      return slot;
    }
  }

  if (item.experience.timeFlexibility === "high") {
    return latestStartSlot;
  }

  return null;
}

function findRoleAwareStartSlot(params: {
  item: PlannedExperience;
  flowRole: FlowRole;
  earliestSlot: number;
  latestStartSlot: number;
  input: PlanningInput;
}): number | null {
  const { item, flowRole, earliestSlot, latestStartSlot } = params;

  if (earliestSlot > latestStartSlot) return null;

  if (flowRole === "recovery" || flowRole === "soft_end") {
    return (
      findLatestAllowedStartSlot({
        item,
        earliestSlot,
        latestStartSlot,
      }) ??
      findLatestFallbackStartSlot({
        item,
        earliestSlot,
        latestStartSlot,
      })
    );
  }

  if (flowRole === "peak") {
    return (
      findFeasibleStartSlot({
        item,
        earliestSlot,
        latestStartSlot,
      }) ??
      findFallbackStartSlot({
        item,
        earliestSlot,
        latestStartSlot,
      })
    );
  }

  return (
    findFeasibleStartSlot({
      item,
      earliestSlot,
      latestStartSlot,
    }) ??
    findFallbackStartSlot({
      item,
      earliestSlot,
      latestStartSlot,
    })
  );
}

function getTailAnchoredEarliestSlot(params: {
  working: ScheduledItem[];
  target: PlannedExperience;
  forcedRole: FlowRole;
  plannedMap: Map<string, PlannedExperience>;
  input: PlanningInput;
  primaryPeakId?: string;
}): number {
  const { working, target, forcedRole, plannedMap, input, primaryPeakId } = params;

  if (working.length === 0) {
    return input.dailyStartSlot;
  }

  if (forcedRole !== "recovery" && forcedRole !== "soft_end") {
    return input.dailyStartSlot;
  }

  const peakIndex = primaryPeakId
    ? working.findIndex((item) => item.experienceId === primaryPeakId)
    : -1;

  const anchorIndex = peakIndex >= 0 ? peakIndex : working.length - 1;
  const anchorItem = working[anchorIndex];
  const anchorPlanned = plannedMap.get(anchorItem.experienceId);

  if (!anchorPlanned) {
    return anchorItem.endSlot;
  }

  const travelMin = getAreaDistanceMinutes(
    anchorPlanned.experience.area,
    target.experience.area,
  );

  return Math.max(anchorItem.endSlot + minutesToSlots(travelMin), input.dailyStartSlot);
}

function estimateRemainingCriticalMinutes(
  ordered: PlannedExperience[],
  nodes: ExperienceSequenceNode[],
  currentIndex: number,
): number {
  let total = 0;

  for (let i = currentIndex + 1; i < ordered.length; i += 1) {
    const planned = ordered[i];
    const role = getRoleForItem(planned, nodes);

    if (isCriticalFlowRole(role)) {
      total += planned.experience.minDuration;
      total += DEFAULT_TRANSITION_MIN;
    }
  }

  return total;
}

// === ADD BELOW estimateRemainingCriticalMinutes ===




function buildTailReservationMap(params: {
  ordered: PlannedExperience[];
  nodes: ExperienceSequenceNode[];
  input: PlanningInput;
}): Map<number, { earliest: number; latest: number }> {
  const { ordered, nodes, input } = params;

  const map = new Map<number, { earliest: number; latest: number }>();

  for (let i = 0; i < ordered.length; i += 1) {
    const item = ordered[i];
    const role = getRoleForItem(item, nodes);

    if (role !== "recovery" && role !== "soft_end") {
      continue;
    }

    // BUG FIX: fitSequenceToTimeline()은 chosenDuration (주로 recommendedDuration)
    // 기준으로 endSlot을 계산한다. 과거엔 여기서 minDuration 을 써서 latest를
    // 계산했고, 결과적으로 startSlot + recommendedDurationSlots 가 dailyEndSlot 을
    // 1슬롯(30분) 넘기는 경우가 반복 발생해 recovery 가 조용히 drop 됐다.
    // 실제 배치에 쓰일 가장 긴 duration 기준으로 latest를 잡아야 startSlot 확정 시
    // 안전하게 dailyEndSlot 안에 들어온다.
    const durationSlots = minutesToSlots(item.experience.recommendedDuration);
    const latest = Math.max(input.dailyStartSlot, input.dailyEndSlot - durationSlots);
    const earliest = Math.max(input.dailyStartSlot, latest - 6);

    map.set(i, { earliest, latest });
  }

  return map;
}

function fitSequenceToTimeline(params: {
  ordered: PlannedExperience[];
  nodes: ExperienceSequenceNode[];
  input: PlanningInput;
}): TimelineFitResult {
  const { ordered, nodes, input } = params;

  const items: ScheduledItem[] = [];
  const droppedOptionalIds: string[] = [];
  const compressedExperienceIds: string[] = [];
  const notes: string[] = [];

  let invalidPlacement = false;
  let currentSlot = input.dailyStartSlot;

  const tailMap = buildTailReservationMap({ ordered, nodes, input });

  for (let i = 0; i < ordered.length; i++) {
    const planned = ordered[i];
    const role = getRoleForItem(planned, nodes);
    const prev = i > 0 ? ordered[i - 1] : undefined;

    const travelMin = prev
      ? getAreaDistanceMinutes(prev.experience.area, planned.experience.area)
      : 0;

    const earliestSlot = currentSlot + minutesToSlots(travelMin);

    const overflowPressureMin = Math.max(
  0,
  items.length > 0 ? (currentSlot - input.dailyEndSlot) * 30 : 0,
);

let chosenDuration = chooseDurationMinutes(planned, overflowPressureMin);

const remainingCriticalMinutes = estimateRemainingCriticalMinutes(ordered, nodes, i);
const remainingAvailableMinutes = Math.max(
  0,
  (input.dailyEndSlot - earliestSlot) * 30,
);

if (
  remainingAvailableMinutes - chosenDuration < remainingCriticalMinutes &&
  role !== "peak" &&
  role !== "recovery" &&
  role !== "soft_end"
) {
  chosenDuration = planned.experience.minDuration;
  compressedExperienceIds.push(planned.experience.id);
  notes.push(`reserveCriticalBuffer=${planned.experience.id}`);
} else if (chosenDuration < planned.experience.recommendedDuration) {
  compressedExperienceIds.push(planned.experience.id);
}

const durationSlots = minutesToSlots(chosenDuration);

    let latestStartSlot = input.dailyEndSlot - durationSlots;

    const tailWindow = tailMap.get(i);

    // === 핵심 수정 ===
    if (role === "recovery" || role === "soft_end") {
      if (tailWindow !== undefined ) {
        latestStartSlot = tailWindow.latest;
      }
    } else if (role !== "peak") {
      // peak 제외 → support/opener만 tail constraint 적용
      const futureTail = Array.from(tailMap.entries())
        .filter(([idx]) => idx > i)
        .map(([, w]) => w.earliest);

      if (futureTail.length > 0) {
        const minTailStart = Math.min(...futureTail);
        latestStartSlot = Math.min(latestStartSlot, minTailStart - durationSlots);
      }
    }

    if (earliestSlot > latestStartSlot) {
      if (planned.priority === "optional") {
        droppedOptionalIds.push(planned.experience.id);
        notes.push(
          `dropInFit=${planned.experience.id}:optional:earliest_gt_latest:earliest=${earliestSlot},latest=${latestStartSlot},role=${role}`,
        );
        continue;
      }

      if (role === "peak") {
        invalidPlacement = true;
        notes.push(`invalidPlacement=${planned.experience.id}:peak_conflict`);
      }

      notes.push(
        `dropInFit=${planned.experience.id}:${planned.priority}:earliest_gt_latest:earliest=${earliestSlot},latest=${latestStartSlot},role=${role}`,
      );
      continue;
    }

    const startSlot =
      role === "recovery" || role === "soft_end"
        ? latestStartSlot // tail은 최대한 뒤
        : earliestSlot;

    const endSlot = startSlot + durationSlots;

    if (endSlot > input.dailyEndSlot) {
      notes.push(
        `dropInFit=${planned.experience.id}:${planned.priority}:end_exceeds_day:endSlot=${endSlot},dailyEnd=${input.dailyEndSlot},role=${role}`,
      );
      continue;
    }

    items.push({
      experienceId: planned.experience.id,
      placeName: planned.experience.placeName,
      startSlot,
      endSlot,
      durationMinutes: durationSlots * 30,
      priority: planned.priority,
      planningTier: planned.planningTier,
      functionalRole: planned.functionalRole,
      themeCluster: planned.themeCluster,
      flowRole: role,
      rhythmSlotType: flowRoleToRhythmSlotType(role),
      isPrimaryPeak: role === "peak",
    });

    currentSlot = endSlot;
  }

  return {
    items,
    invalidPlacement,
    droppedOptionalIds,
    compressedExperienceIds,
    notes,
  };
}
function recomputeSequentialTimeline(
  fittedItems: ScheduledItem[],
  plannedMap: Map<string, PlannedExperience>,
  input: PlanningInput,
  primaryPeakId?: string,
): ScheduledItem[] {
  if (fittedItems.length === 0) return [];

  const recomputed: ScheduledItem[] = [];

  for (let i = 0; i < fittedItems.length; i += 1) {
    const base = fittedItems[i];
    const planned = plannedMap.get(base.experienceId);
    if (!planned) continue;

    const prev = i > 0 ? recomputed[i - 1] : undefined;
    const prevPlanned = prev ? plannedMap.get(prev.experienceId) : undefined;
    const travel = prevPlanned
      ? getAreaDistanceMinutes(prevPlanned.experience.area, planned.experience.area)
      : 0;

    const earliest = prev ? prev.endSlot + minutesToSlots(travel) : input.dailyStartSlot;
    const durationSlots = minutesToSlots(base.durationMinutes);
    const latestStart = Math.max(input.dailyStartSlot, input.dailyEndSlot - durationSlots);

    const start = findRoleAwareStartSlot({
      item: planned,
      flowRole: base.flowRole ?? "support",
      earliestSlot: earliest,
      latestStartSlot: latestStart,
      input,
    });

    if (start === null) continue;

    recomputed.push({
      ...base,
      startSlot: start,
      endSlot: start + durationSlots,
    });
  }

  if (primaryPeakId && recomputed.length >= 3) {
    const peakIdx = recomputed.findIndex(
      (item) => item.experienceId === primaryPeakId,
    );

    if (peakIdx === 0 || peakIdx === recomputed.length - 1) {
      const [peakItem] = recomputed.splice(peakIdx, 1);
      const targetIndex = Math.max(1, Math.floor(recomputed.length / 2) - 1);
      recomputed.splice(targetIndex, 0, peakItem);
    }
  }

  return recomputed;
}
function getOverflowMin(items: ScheduledItem[], dayEndSlot: number): number {
  if (items.length === 0) return 0;
  return Math.max(0, (items[items.length - 1].endSlot - dayEndSlot) * 30);
}

function hasPreservedPeak(items: ScheduledItem[], peakId?: string): boolean {
  if (!peakId) return false;
  return items.some((item) => item.experienceId === peakId);
}

function hasPreservedRecovery(items: ScheduledItem[], recoveryId?: string): boolean {
  if (!recoveryId) return false;
  return items.some((item) => item.experienceId === recoveryId);
}

function isLateFallbackCandidate(
  item: PlannedExperience,
  referencePeak?: PlannedExperience,
  referenceRecovery?: PlannedExperience,
): boolean {
  if (item.experience.recommendedDuration > 120) return false;
  if (item.experience.fatigue > 4) return false;

  const allowed = safeAllowedTimes(item.experience);
  const lateFriendly =
    allowed.length === 0 ||
    allowed.includes("afternoon") ||
    allowed.includes("sunset") ||
    allowed.includes("dinner") ||
    allowed.includes("night");

  if (!lateFriendly) return false;

  const isMeal = item.experience.isMeal;
  const isRest = isRecoveryCandidate(item);
  const mediumFlex =
    item.experience.timeFlexibility === "high" ||
    item.experience.timeFlexibility === "medium";
  const quietish = item.experience.features.quiet >= 0.45;
  const shortEnough = item.experience.recommendedDuration <= 75;

  if (!isMeal && !isRest && !mediumFlex && !quietish && !shortEnough) {
    return false;
  }

  if (referenceRecovery) {
    if (
      item.experience.area === referenceRecovery.experience.area ||
      item.themeCluster === referenceRecovery.themeCluster
    ) {
      return true;
    }
  }

  if (referencePeak) {
    if (
      item.experience.area === referencePeak.experience.area ||
      item.themeCluster === referencePeak.themeCluster
    ) {
      return true;
    }
  }

  return isMeal || isRest || mediumFlex || quietish || shortEnough;
}

function computeTailFallbackScore(params: {
  candidate: PlannedExperience;
  primaryPeak?: PlannedExperience;
  primaryRecovery?: PlannedExperience;
}): number {
  const { candidate, primaryPeak, primaryRecovery } = params;

  const sameRecoveryArea =
    primaryRecovery && candidate.experience.area === primaryRecovery.experience.area ? 1.6 : 0;
  const samePeakArea =
    primaryPeak && candidate.experience.area === primaryPeak.experience.area ? 1.1 : 0;
  const sameRecoveryCluster =
    primaryRecovery && candidate.themeCluster === primaryRecovery.themeCluster ? 1.4 : 0;
  const samePeakCluster =
    primaryPeak && candidate.themeCluster === primaryPeak.themeCluster ? 0.8 : 0;

  const mealOrRest =
    (candidate.experience.isMeal ? 1.2 : 0) +
    (isRecoveryCandidate(candidate) ? 1.0 : 0);

  const flexibility =
    candidate.experience.timeFlexibility === "high"
      ? 0.8
      : candidate.experience.timeFlexibility === "medium"
        ? 0.35
        : 0;

  const shortBonus = candidate.experience.recommendedDuration <= 75 ? 0.45 : 0;
  const quietBonus = candidate.experience.features.quiet >= 0.45 ? 0.4 : 0;
  const fatigueBonus = candidate.experience.fatigue <= 3 ? 0.35 : 0;

  return (
    candidate.planningScore +
    sameRecoveryArea +
    samePeakArea +
    sameRecoveryCluster +
    samePeakCluster +
    mealOrRest +
    flexibility +
    shortBonus +
    quietBonus +
    fatigueBonus
  );
}

function pickLateFallbackCandidate(params: {
  working: ScheduledItem[];
  plannedMap: Map<string, PlannedExperience>;
  primaryPeak?: PlannedExperience;
  primaryRecovery?: PlannedExperience;
  lateFallbackIds?: string[];
}): PlannedExperience | undefined {
  const {
    working,
    plannedMap,
    primaryPeak,
    primaryRecovery,
    lateFallbackIds,
  } = params;

  const usedIds = new Set(working.map((item) => item.experienceId));

  const preferredPool = (lateFallbackIds ?? [])
    .map((id) => plannedMap.get(id))
    .filter((item): item is PlannedExperience => !!item)
    .filter((item) => !usedIds.has(item.experience.id))
    .filter((item) => isLateFallbackCandidate(item, primaryPeak, primaryRecovery))
    .sort(
      (a, b) =>
        computeTailFallbackScore({ candidate: b, primaryPeak, primaryRecovery }) -
        computeTailFallbackScore({ candidate: a, primaryPeak, primaryRecovery }),
    );

  if (preferredPool.length > 0) {
    return preferredPool[0];
  }

  const pool = Array.from(plannedMap.values())
    .filter((item) => !usedIds.has(item.experience.id))
    .filter((item) =>
      isLateFallbackCandidate(item, primaryPeak, primaryRecovery),
    )
    .sort(
      (a, b) =>
        computeTailFallbackScore({ candidate: b, primaryPeak, primaryRecovery }) -
        computeTailFallbackScore({ candidate: a, primaryPeak, primaryRecovery }),
    );

  return pool[0];
}

function scoreTailCandidate(params: {
  candidate: PlannedExperience;
  primaryPeak?: PlannedExperience;
  primaryRecovery?: PlannedExperience;
}): number {
  const { candidate, primaryPeak, primaryRecovery } = params;

  const sameRecoveryArea =
    primaryRecovery && candidate.experience.area === primaryRecovery.experience.area ? 2.4 : 0;
  const samePeakArea =
    primaryPeak && candidate.experience.area === primaryPeak.experience.area ? 1.6 : 0;
  const sameRecoveryCluster =
    primaryRecovery && candidate.themeCluster === primaryRecovery.themeCluster ? 1.8 : 0;
  const samePeakCluster =
    primaryPeak && candidate.themeCluster === primaryPeak.themeCluster ? 1.0 : 0;
  const restBonus = isRecoveryCandidate(candidate) ? 1.2 : 0;
  const mealBonus = candidate.experience.isMeal ? 1.0 : 0;
  const flexBonus =
    candidate.experience.timeFlexibility === "high"
      ? 0.8
      : candidate.experience.timeFlexibility === "medium"
        ? 0.4
        : 0;
  const shortBonus = candidate.experience.recommendedDuration <= 75 ? 0.5 : 0;
  const fatigueBonus = candidate.experience.fatigue <= 3 ? 0.5 : 0;
  const quietBonus = candidate.experience.features.quiet >= 0.45 ? 0.5 : 0;

  return (
    sameRecoveryArea +
    samePeakArea +
    sameRecoveryCluster +
    samePeakCluster +
    restBonus +
    mealBonus +
    flexBonus +
    shortBonus +
    fatigueBonus +
    quietBonus +
    candidate.planningScore
  );
}

function rebuildTailAfterPeak(params: {
  working: ScheduledItem[];
  input: PlanningInput;
  plannedMap: Map<string, PlannedExperience>;
  primaryPeak?: PlannedExperience;
  primaryRecovery?: PlannedExperience;
  lateFallbackIds?: string[];
}): { items: ScheduledItem[]; insertedIds: string[] } {
  const { working, input, plannedMap, primaryPeak, primaryRecovery, lateFallbackIds } = params;

  if (!primaryPeak) {
    return { items: working, insertedIds: [] };
  }

  const peakIndex = working.findIndex(
    (item) => item.experienceId === primaryPeak.experience.id,
  );

  if (peakIndex < 0) {
    return { items: working, insertedIds: [] };
  }

  const prefix = working.slice(0, peakIndex + 1);
  let rebuilt = recomputeSequentialTimeline(
  prefix,
  plannedMap,
  input,
  primaryPeak?.experience.id,
  );
  const insertedIds: string[] = [];
  const usedIds = new Set(rebuilt.map((item) => item.experienceId));

  const candidatePool: PlannedExperience[] = [];

  if (primaryRecovery && !usedIds.has(primaryRecovery.experience.id)) {
    candidatePool.push(primaryRecovery);
  }

  for (const id of lateFallbackIds ?? []) {
    const item = plannedMap.get(id);
    if (
      item &&
      !usedIds.has(item.experience.id) &&
      !candidatePool.some((x) => x.experience.id === item.experience.id)
    ) {
      candidatePool.push(item);
    }
  }

  for (const item of plannedMap.values()) {
    if (
      !usedIds.has(item.experience.id) &&
      !candidatePool.some((x) => x.experience.id === item.experience.id)
    ) {
      candidatePool.push(item);
    }
  }

  const ranked = candidatePool
    .filter((item) => item.experience.id !== primaryPeak.experience.id)
    .filter((item) => isLateFallbackCandidate(item, primaryPeak, primaryRecovery))
    .sort(
      (a, b) =>
        scoreTailCandidate({ candidate: b, primaryPeak, primaryRecovery }) -
        scoreTailCandidate({ candidate: a, primaryPeak, primaryRecovery }),
    );

  const maxTailAdds = 1;
  
  for (const candidate of ranked) {
    if (insertedIds.length >= maxTailAdds) {
      break;
    }

    if (rebuilt.some((item) => item.experienceId === candidate.experience.id)) {
      continue;
    }

    const forcedRole: FlowRole =
      insertedIds.length === 0 && isRecoveryCandidate(candidate)
        ? primaryRecovery
          ? "recovery"
          : "soft_end"
        : "soft_end";

    const targetDurationSlots = minutesToSlots(candidate.experience.minDuration);
    const latestStartSlot = Math.max(
      input.dailyStartSlot,
      input.dailyEndSlot - targetDurationSlots,
    );

    const candidateIndices: number[] = [];
    const rebuiltPeakIndex = rebuilt.findIndex(
      (item) => item.experienceId === primaryPeak.experience.id,
    );

    const minInsertionIndex = rebuiltPeakIndex >= 0 ? rebuiltPeakIndex + 1 : 0;

    for (let insertionIndex = rebuilt.length; insertionIndex >= minInsertionIndex; insertionIndex -= 1) {
      candidateIndices.push(insertionIndex);
    }

    let inserted = false;

    for (const insertionIndex of candidateIndices) {
      const trial = [...rebuilt];

      trial.splice(insertionIndex, 0, {
        experienceId: candidate.experience.id,
        placeName: candidate.experience.placeName,
        startSlot: input.dailyStartSlot,
        endSlot: input.dailyStartSlot + targetDurationSlots,
        durationMinutes: targetDurationSlots * 30,
        priority: candidate.priority,
        planningTier: candidate.planningTier,
        functionalRole: candidate.functionalRole,
        themeCluster: candidate.themeCluster,
        flowRole: forcedRole,
        rhythmSlotType: flowRoleToRhythmSlotType(forcedRole),
        isPrimaryPeak: false,
      });

      const recomputed = recomputeSequentialTimeline(
        trial,
        plannedMap,
        input,
        primaryPeak?.experience.id,
      );
      const recomputedPeakIndex = recomputed.findIndex(
        (item) => item.experienceId === primaryPeak.experience.id,
      );
      const recomputedTargetIndex = recomputed.findIndex(
        (item) => item.experienceId === candidate.experience.id,
      );
      const recomputedTarget = recomputed.find(
        (item) => item.experienceId === candidate.experience.id,
      );

      if (recomputedTargetIndex < 0 || !recomputedTarget) {
        continue;
      }

      if (recomputedTarget.startSlot > latestStartSlot) {
        continue;
      }

      // 핵심: peak 앞이나 peak 자리로 삽입되는 경우 금지
      if (
        recomputedPeakIndex >= 0 &&
        recomputedTargetIndex <= recomputedPeakIndex
      ) {
        continue;
      }

      rebuilt = recomputed;
      insertedIds.push(candidate.experience.id);
      inserted = true;
      break;
    }

    if (inserted) {
      continue;
    }
  }

  return { items: rebuilt, insertedIds };
}
function tryInsertLateFallbackSupport(params: {
  working: ScheduledItem[];
  input: PlanningInput;
  plannedMap: Map<string, PlannedExperience>;
  primaryPeak?: PlannedExperience;
  primaryRecovery?: PlannedExperience;
  lateFallbackIds?: string[];
}): { items: ScheduledItem[]; insertedId?: string } {
  const {
    working,
    input,
    plannedMap,
    primaryPeak,
    primaryRecovery,
    lateFallbackIds,
  } = params;

  const fallback = pickLateFallbackCandidate({
    working,
    plannedMap,
    primaryPeak,
    primaryRecovery,
    lateFallbackIds,
  });

  if (!fallback) {
    return { items: working };
  }

  const inserted = tryReinsertCriticalItem({
    working,
    target: fallback,
    forcedRole: "soft_end",
    input,
    plannedMap,
    primaryPeakId: primaryPeak?.experience.id,
  });

  const insertedOk = inserted.some(
    (item) => item.experienceId === fallback.experience.id,
  );

  return {
    items: inserted,
    insertedId: insertedOk ? fallback.experience.id : undefined,
  };
}

function tryReinsertCriticalItem(params: {
  working: ScheduledItem[];
  target: PlannedExperience;
  forcedRole: FlowRole;
  input: PlanningInput;
  plannedMap: Map<string, PlannedExperience>;
  primaryPeakId?: string;
}): ScheduledItem[] {
  const { working, target, forcedRole, input, plannedMap, primaryPeakId } = params;

  if (working.some((item) => item.experienceId === target.experience.id)) {
    return working;
  }

  const targetDurationSlots = minutesToSlots(target.experience.minDuration);
  const latestStartSlot = Math.max(
    input.dailyStartSlot,
    input.dailyEndSlot - targetDurationSlots,
  );

  const peakIndex = primaryPeakId
    ? working.findIndex((item) => item.experienceId === primaryPeakId)
    : -1;

  const searchIndices: number[] = [];

  if (forcedRole === "recovery" || forcedRole === "soft_end") {
    const startIndex = peakIndex >= 0 ? peakIndex + 1 : 0;

    for (let i = working.length; i >= startIndex; i -= 1) {
      searchIndices.push(i);
    }
  } else {
    for (let i = 0; i <= working.length; i += 1) {
      searchIndices.push(i);
    }
  }

  for (const insertionIndex of searchIndices) {
    const trial = [...working];

    trial.splice(insertionIndex, 0, {
      experienceId: target.experience.id,
      placeName: target.experience.placeName,
      startSlot: input.dailyStartSlot,
      endSlot: input.dailyStartSlot + targetDurationSlots,
      durationMinutes: targetDurationSlots * 30,
      priority: target.priority,
      planningTier: target.planningTier,
      functionalRole: target.functionalRole,
      themeCluster: target.themeCluster,
      flowRole: forcedRole,
      rhythmSlotType: flowRoleToRhythmSlotType(forcedRole),
      isPrimaryPeak: forcedRole === "peak",
    });

    const recomputed = recomputeSequentialTimeline(
      trial,
      plannedMap,
      input,
      primaryPeakId,
    );
    const inserted = recomputed.find(
      (item) => item.experienceId === target.experience.id,
    );

    if (!inserted) {
      continue;
    }

    if (inserted.startSlot > latestStartSlot) {
      continue;
    }

    if (
      (forcedRole === "recovery" || forcedRole === "soft_end") &&
      primaryPeakId
    ) {
      const recomputedPeakIndex = recomputed.findIndex(
        (item) => item.experienceId === primaryPeakId,
      );
      const recomputedTargetIndex = recomputed.findIndex(
        (item) => item.experienceId === target.experience.id,
      );

      if (
        recomputedPeakIndex >= 0 &&
        recomputedTargetIndex >= 0 &&
        recomputedTargetIndex <= recomputedPeakIndex
      ) {
        continue;
      }
    }

    return recomputed;
  }

  return working;
}

function tryRestoreRecoveryBySacrificingSupport(params: {
  working: ScheduledItem[];
  input: PlanningInput;
  plannedMap: Map<string, PlannedExperience>;
  primaryPeak?: PlannedExperience;
  primaryRecovery: PlannedExperience;
}): { items: ScheduledItem[]; droppedId?: string } {
  const { working, input, plannedMap, primaryPeak, primaryRecovery } = params;

  const removableSupport = [...working]
    .filter((item) => item.experienceId !== primaryRecovery.experience.id)
    .filter((item) => item.experienceId !== primaryPeak?.experience.id)
    .filter((item) => item.flowRole !== "recovery" && item.flowRole !== "soft_end")
    .sort((a, b) => {
      const aDropScore =
        (a.priority === "optional" ? 3 : 0) +
        (a.flowRole === "opener" ? 2 : 0) +
        (a.flowRole === "activation" ? 1.5 : 0) +
        (a.flowRole === "transition" ? 1.2 : 0) -
        (a.isPrimaryPeak ? 100 : 0);

      const bDropScore =
        (b.priority === "optional" ? 3 : 0) +
        (b.flowRole === "opener" ? 2 : 0) +
        (b.flowRole === "activation" ? 1.5 : 0) +
        (b.flowRole === "transition" ? 1.2 : 0) -
        (b.isPrimaryPeak ? 100 : 0);

      return bDropScore - aDropScore;
    });

  for (const candidate of removableSupport) {
    const reduced = working.filter(
      (item) => item.experienceId !== candidate.experienceId,
    );

    const restored = tryReinsertCriticalItem({
      working: reduced,
      target: primaryRecovery,
      forcedRole: "recovery",
      input,
      plannedMap,
      primaryPeakId: primaryPeak?.experience.id,
    });

    if (hasPreservedRecovery(restored, primaryRecovery.experience.id)) {
      return {
        items: restored,
        droppedId: candidate.experienceId,
      };
    }
  }

  return { items: working };
}


function repairTimeline(params: {
  fitted: TimelineFitResult;
  input: PlanningInput;
  skeletonType: DaySkeletonType;
  primaryPeak?: PlannedExperience;
  primaryRecovery?: PlannedExperience;
  plannedMap: Map<string, PlannedExperience>;
  lateFallbackIds?: string[];
}): RepairResult {
  const {
    fitted,
    input,
    skeletonType,
    primaryPeak,
    primaryRecovery,
    plannedMap,
    lateFallbackIds,
  } = params;

  let working = [...fitted.items];
  const repairs: RepairActionLog[] = [];
  const droppedOptionalIds = [...fitted.droppedOptionalIds];
  const compressedExperienceIds = [...fitted.compressedExperienceIds];
  const notes = [...fitted.notes];
  let step = 1;

  const initialOverflow = getOverflowMin(working, input.dailyEndSlot);

  if (working.length > 1) {
    const peakIndex = primaryPeak
      ? working.findIndex((item) => item.experienceId === primaryPeak.experience.id)
      : -1;

    const recoveryIndex = primaryRecovery
      ? working.findIndex((item) => item.experienceId === primaryRecovery.experience.id)
      : -1;

    if (peakIndex > 0 && peakIndex === working.length - 1 && working.length >= 3) {
      const [peakItem] = working.splice(peakIndex, 1);

      const targetPeakIndex = Math.max(1, Math.floor(working.length / 2) - 1);
      working.splice(targetPeakIndex, 0, peakItem);

      working = recomputeSequentialTimeline(
        working,
        plannedMap,
        input,
        primaryPeak?.experience.id,
      );

      if (primaryRecovery && !hasPreservedRecovery(working, primaryRecovery.experience.id)) {
        const rebuiltTail = rebuildTailAfterPeak({
          working,
          input,
          plannedMap,
          primaryPeak,
          primaryRecovery,
          lateFallbackIds,
        });

        if (rebuiltTail.insertedIds.length > 0) {
          working = rebuiltTail.items;
          for (const insertedId of rebuiltTail.insertedIds) {
            notes.push(`tailRebuildInsert=${insertedId}:after_move_peak_earlier`);
          }
        }
      }

      repairs.push({
        step: step++,
        action: "move_peak_earlier",
        targetExperienceId: peakItem.experienceId,
        beforeOverflowMin: initialOverflow,
        afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
        reason: "Protect middle peak positioning",
      });

      if (skeletonType === "balanced" && working.length === 2 && primaryPeak) {
        const candidate = Array.from(plannedMap.values())
          .filter((p) => !working.some((w) => w.experienceId === p.experience.id))
          .filter((p) => p.experience.id !== primaryPeak.experience.id)
          .filter((p) => p.experience.recommendedDuration <= 90)
          .filter((p) => p.experience.fatigue <= 4)
          .filter((p) => {
            const allowed = safeAllowedTimes(p.experience);
            return (
              p.experience.isMeal ||
              isRecoveryCandidate(p) ||
              p.experience.timeFlexibility !== "low"
            ) && (
              allowed.length === 0 ||
              allowed.includes("afternoon") ||
              allowed.includes("sunset") ||
              allowed.includes("dinner") ||
              allowed.includes("night")
            );
          })
          .sort((a, b) => b.planningScore - a.planningScore)[0];

        if (candidate) {
          const beforeRescueOverflow = getOverflowMin(working, input.dailyEndSlot);

          const rescued = tryReinsertCriticalItem({
            working,
            target: candidate,
            forcedRole: "soft_end",
            input,
            plannedMap,
            primaryPeakId: primaryPeak.experience.id,
          });

          if (rescued.some((x) => x.experienceId === candidate.experience.id)) {
            working = rescued;
            notes.push(`balancedTailRescue=${candidate.experience.id}:after_move_peak_earlier`);

            repairs.push({
              step: step++,
              action: "insert_recovery",
              targetExperienceId: candidate.experience.id,
              beforeOverflowMin: beforeRescueOverflow,
              afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
              reason: "Balanced safeguard rescued short soft_end after 2-item collapse",
            });
          }
        }
      }
    }

    if (recoveryIndex >= 0 && peakIndex >= 0 && recoveryIndex <= peakIndex && working.length >= 3) {
      const [recoveryItem] = working.splice(recoveryIndex, 1);
      working.push(recoveryItem);

      working = recomputeSequentialTimeline(
        working,
        plannedMap,
        input,
        primaryPeak?.experience.id,
      );

      repairs.push({
        step: step++,
        action: "insert_recovery",
        targetExperienceId: recoveryItem.experienceId,
        beforeOverflowMin: initialOverflow,
        afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
        reason: "Push recovery after peak to restore closing structure",
      });
    }
  }

  // =========================================================================
  // NEW: early recovery protection
  // overflow trimming 전에 recovery를 먼저 살려 본다.
  // 핵심 의도:
  // - recovery가 마지막에 soft miss 되는 구조를 줄인다.
  // - optional trimming보다 recovery reinsertion을 먼저 시도한다.
  // =========================================================================
  if (
    primaryRecovery &&
    !hasPreservedRecovery(working, primaryRecovery.experience.id)
  ) {
    const beforeOverflowMin = getOverflowMin(working, input.dailyEndSlot);

    const reinjectedRecovery = tryReinsertCriticalItem({
      working,
      target: primaryRecovery,
      forcedRole: "recovery",
      input,
      plannedMap,
      primaryPeakId: primaryPeak?.experience.id,
    });

    const recoveryRestored = hasPreservedRecovery(
      reinjectedRecovery,
      primaryRecovery.experience.id,
    );

    if (recoveryRestored) {
      working = reinjectedRecovery;
      notes.push(`earlyRecoveryInsert=${primaryRecovery.experience.id}`);

      repairs.push({
        step: step++,
        action: "insert_recovery",
        targetExperienceId: primaryRecovery.experience.id,
        beforeOverflowMin,
        afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
        reason: "Early recovery protection before optional trimming",
      });
    }
  }

  let overflow = getOverflowMin(working, input.dailyEndSlot);

  if (overflow > 0) {
    const removable = [...working]
      .filter(
        (item) =>
          item.priority === "optional" &&
          !item.isPrimaryPeak &&
          item.flowRole !== "peak" &&
          item.flowRole !== "recovery" &&
          item.flowRole !== "soft_end",
      )
      .sort((a, b) => b.durationMinutes - a.durationMinutes);

    for (const target of removable) {
      if (overflow <= 0) break;

      const beforeOverflowMin = overflow;
      working = working.filter((item) => item.experienceId !== target.experienceId);
      working = recomputeSequentialTimeline(
        working,
        plannedMap,
        input,
        primaryPeak?.experience.id,
      );

      overflow = getOverflowMin(working, input.dailyEndSlot);
      droppedOptionalIds.push(target.experienceId);

      repairs.push({
        step: step++,
        action: "remove_optional",
        targetExperienceId: target.experienceId,
        beforeOverflowMin,
        afterOverflowMin: overflow,
        reason: "Remove optional support before touching peak/recovery",
      });
    }
  }

  if (primaryPeak && !hasPreservedPeak(working, primaryPeak.experience.id)) {
    const beforeOverflowMin = getOverflowMin(working, input.dailyEndSlot);
    const trimmed = [...working].filter(
      (item) =>
        !(item.priority === "optional" && item.flowRole !== "recovery" && item.flowRole !== "soft_end"),
    );

    working = tryReinsertCriticalItem({
      working: trimmed,
      target: primaryPeak,
      forcedRole: "peak",
      input,
      plannedMap,
      primaryPeakId: primaryPeak.experience.id,
    });

    repairs.push({
      step: step++,
      action: "move_peak_earlier",
      targetExperienceId: primaryPeak.experience.id,
      beforeOverflowMin,
      afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
      reason: "Reinsert missing peak after trimming non-critical support",
    });
  }

  const substitutedExperienceIds: string[] = [];

  if (primaryRecovery && !hasPreservedRecovery(working, primaryRecovery.experience.id)) {
  const beforeOverflowMin = getOverflowMin(working, input.dailyEndSlot);
  const trimmed = [...working].filter(
    (item) => !(item.priority === "optional" && item.flowRole !== "peak"),
  );

  const reinjectedRecovery = tryReinsertCriticalItem({
    working: trimmed,
    target: primaryRecovery,
    forcedRole: "recovery",
    input,
    plannedMap,
    primaryPeakId: primaryPeak?.experience.id,
  });

  const recoveryRestored = hasPreservedRecovery(
    reinjectedRecovery,
    primaryRecovery.experience.id,
  );

  if (recoveryRestored) {
    working = reinjectedRecovery;

    repairs.push({
      step: step++,
      action: "insert_recovery",
      targetExperienceId: primaryRecovery.experience.id,
      beforeOverflowMin,
      afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
      reason: "Reinsert missing recovery after trimming non-critical support",
    });
  } else {
    const sacrificed = tryRestoreRecoveryBySacrificingSupport({
      working: trimmed,
      input,
      plannedMap,
      primaryPeak,
      primaryRecovery,
    });

    const sacrificedRecoveryRestored = hasPreservedRecovery(
      sacrificed.items,
      primaryRecovery.experience.id,
    );

    if (sacrificedRecoveryRestored) {
      working = sacrificed.items;

      if (sacrificed.droppedId) {
        droppedOptionalIds.push(sacrificed.droppedId);
        notes.push(
          `criticalRecoverySacrifice=${sacrificed.droppedId}:for_${primaryRecovery.experience.id}`,
        );
      }

      repairs.push({
        step: step++,
        action: "insert_recovery",
        targetExperienceId: primaryRecovery.experience.id,
        beforeOverflowMin,
        afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
        reason: "Sacrifice non-peak support to preserve original recovery",
      });
    } else {
      const rebuiltTail = primaryPeak
        ? rebuildTailAfterPeak({
            working: trimmed,
            input,
            plannedMap,
            primaryPeak,
            primaryRecovery,
            lateFallbackIds,
          })
        : { items: trimmed, insertedIds: [] as string[] };

      if (rebuiltTail.insertedIds.length > 0) {
        working = rebuiltTail.items;
        substitutedExperienceIds.push(...rebuiltTail.insertedIds);

        for (const insertedId of rebuiltTail.insertedIds) {
          notes.push(`tailRebuildInsert=${insertedId}:after_missing_recovery`);
        }

        repairs.push({
          step: step++,
          action: "insert_recovery",
          targetExperienceId: rebuiltTail.insertedIds[0],
          beforeOverflowMin,
          afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
          reason: "Tail rebuild inserted late support after recovery soft miss",
        });
      } else {
        const fallbackInserted = tryInsertLateFallbackSupport({
          working: trimmed,
          input,
          plannedMap,
          primaryPeak,
          primaryRecovery,
          lateFallbackIds,
        });

        working = fallbackInserted.items;

        if (fallbackInserted.insertedId) {
          substitutedExperienceIds.push(fallbackInserted.insertedId);
          notes.push(
            `lateFallbackInsert=${fallbackInserted.insertedId}:after_missing_recovery`,
          );

          repairs.push({
            step: step++,
            action: "insert_recovery",
            targetExperienceId: fallbackInserted.insertedId,
            beforeOverflowMin,
            afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
            reason: "Fallback late support inserted after recovery soft miss",
          });
        } else {
          if (
            primaryPeak &&
            working.length === 2 &&
            input.dailyDensity >= 3
          ) {
            const emergencyTail = Array.from(plannedMap.values())
              .filter((item) => !working.some((w) => w.experienceId === item.experience.id))
              .filter((item) => item.experience.id !== primaryPeak.experience.id)
              .filter((item) => {
                const allowed = safeAllowedTimes(item.experience);
                return (
                  item.experience.recommendedDuration <= 90 &&
                  item.experience.fatigue <= 4 &&
                  (item.experience.isMeal ||
                    isRecoveryCandidate(item) ||
                    item.experience.timeFlexibility !== "low") &&
                  (allowed.length === 0 ||
                    allowed.includes("afternoon") ||
                    allowed.includes("sunset") ||
                    allowed.includes("dinner") ||
                    allowed.includes("night"))
                );
              })
              .sort((a, b) => {
                const aScore =
                  (a.experience.area === primaryPeak.experience.area ? 2 : 0) +
                  (a.themeCluster === primaryPeak.themeCluster ? 1.2 : 0) +
                  (a.experience.isMeal ? 1 : 0) +
                  (isRecoveryCandidate(a) ? 1 : 0) +
                  a.planningScore;

                const bScore =
                  (b.experience.area === primaryPeak.experience.area ? 2 : 0) +
                  (b.themeCluster === primaryPeak.themeCluster ? 1.2 : 0) +
                  (b.experience.isMeal ? 1 : 0) +
                  (isRecoveryCandidate(b) ? 1 : 0) +
                  b.planningScore;

                return bScore - aScore;
              })[0];

            if (emergencyTail) {
              const withEmergencyTail = tryReinsertCriticalItem({
                working,
                target: emergencyTail,
                forcedRole: "soft_end",
                input,
                plannedMap,
                primaryPeakId: primaryPeak.experience.id,
              });

              if (withEmergencyTail.some((x) => x.experienceId === emergencyTail.experience.id)) {
                working = withEmergencyTail;
                substitutedExperienceIds.push(emergencyTail.experience.id);
                notes.push(`emergencyTailInsert=${emergencyTail.experience.id}:after_missing_recovery`);

                repairs.push({
                  step: step++,
                  action: "insert_recovery",
                  targetExperienceId: emergencyTail.experience.id,
                  beforeOverflowMin,
                  afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
                  reason: "Emergency tail insert after peak-preserving 2-item collapse",
                });
              }
            }
          }

          if (!working.some((x) => x.flowRole === "soft_end" || x.flowRole === "recovery")) {
            const lateFallbackMissNote =
              `lateFallbackMiss=${primaryRecovery.experience.id}:no_viable_support`;
            const softMissNote =
              `softMiss=${primaryRecovery.experience.id}:protected_role=${primaryRecovery.functionalRole === "rest" ? "soft_end" : "recovery"}`;

            if (!notes.includes(lateFallbackMissNote)) {
              notes.push(lateFallbackMissNote);
            }

            if (!notes.includes(softMissNote)) {
              notes.push(softMissNote);
            }
          }
        }
      }
    }
  }
}

  overflow = getOverflowMin(working, input.dailyEndSlot);

  const preservedPeak = hasPreservedPeak(working, primaryPeak?.experience.id);
  const preservedOriginalRecovery = hasPreservedRecovery(
    working,
    primaryRecovery?.experience.id,
  );
  const recoveredTailRole =
    preservedOriginalRecovery ||
    substitutedExperienceIds.length > 0 ||
    !primaryRecovery;

  if (primaryPeak && working.length >= 3) {
    const peakIdx = working.findIndex(
      (item) => item.experienceId === primaryPeak.experience.id,
    );

    if (peakIdx >= 0) {
      const [peakItem] = working.splice(peakIdx, 1);
      const targetIndex = Math.max(1, Math.floor(working.length / 2) - 1);
      working.splice(targetIndex, 0, peakItem);

      working = recomputeSequentialTimeline(
        working,
        plannedMap,
        input,
        primaryPeak?.experience.id,
      );

      notes.push(`finalPeakNormalize=${peakItem.experienceId}`);
    }
  }

  if (
    primaryRecovery &&
    !hasPreservedRecovery(working, primaryRecovery.experience.id) &&
    working.length >= 2
  ) {
    const tailCandidateIdx = working.findIndex(
      (item) =>
        item.flowRole === "recovery" ||
        item.flowRole === "soft_end" ||
        substitutedExperienceIds.includes(item.experienceId),
    );

    if (tailCandidateIdx >= 0 && tailCandidateIdx !== working.length - 1) {
      const [tailItem] = working.splice(tailCandidateIdx, 1);
      working.push(tailItem);

      working = recomputeSequentialTimeline(
        working,
        plannedMap,
        input,
        primaryPeak?.experience.id,
      );

      notes.push(`finalRecoveryNormalize=${tailItem.experienceId}`);
    }
  }

  overflow = getOverflowMin(working, input.dailyEndSlot);

  const finalPreservedPeak = hasPreservedPeak(working, primaryPeak?.experience.id);
  const finalPreservedOriginalRecovery = hasPreservedRecovery(
    working,
    primaryRecovery?.experience.id,
  );
  const finalRecoveredTailRole =
    finalPreservedOriginalRecovery ||
    working.some((item) => item.flowRole === "recovery" || item.flowRole === "soft_end") ||
    substitutedExperienceIds.length > 0 ||
    !primaryRecovery;

  const timelineDiagnostics: TimelineDiagnostics = {
    overflowMin: overflow,
    invalidPlacement: fitted.invalidPlacement || !finalPreservedPeak,
    compressedExperienceIds: Array.from(new Set(compressedExperienceIds)),
    substitutedExperienceIds: Array.from(new Set(substitutedExperienceIds)),
    droppedOptionalIds: Array.from(new Set(droppedOptionalIds)),
    preservedPeak: finalPreservedPeak,
    preservedOriginalRecovery: finalPreservedOriginalRecovery,
    recoveredTailRole: finalRecoveredTailRole,
    notes: Array.from(new Set(notes)),
  };

  return {
    items: working,
    repairs,
    timelineDiagnostics,
  };
}
export function evaluateFeasibility(
  dayPlan: DayPlan,
  items: ScheduledItem[],
  dayEndSlot: number,
): FeasibilityReport {
  const issues: ScheduleIssue[] = [];
  const plannedItems = [...dayPlan.anchor, ...dayPlan.core, ...dayPlan.optional];
  const expMap = new Map(plannedItems.map((x) => [x.experience.id, x]));

  let totalFatigue = 0;

  for (const item of items) {
    const planned = expMap.get(item.experienceId);
    if (!planned) continue;

    totalFatigue += planned.experience.fatigue;

    if (item.durationMinutes < planned.experience.minDuration) {
      issues.push("duration_violation");
    }

    if (!isAllowedWithTolerance(planned.experience, item.startSlot, item.flowRole)) {
      const isSoftRole =
        item.flowRole === "peak" ||
        item.flowRole === "recovery" ||
        item.flowRole === "soft_end";

      const isSoftFlex =
        planned.experience.timeFlexibility === "high" ||
        (planned.experience.timeFlexibility === "medium" && planned.experience.isMeal);

      if (!isSoftRole && !isSoftFlex) {
        issues.push("time_window_violation");
      }
    }

    if (item.endSlot > dayEndSlot) {
      issues.push("time_overflow");
    }
  }

  if (totalFatigue > MAX_FATIGUE_SAFE) {
    issues.push("fatigue_overflow");
  }

  let areaOverjumpCount = 0;
  for (let i = 1; i < items.length; i += 1) {
    const prevArea = expMap.get(items[i - 1].experienceId)?.experience.area ?? "other";
    const currentArea = expMap.get(items[i].experienceId)?.experience.area ?? "other";

    if (getAreaDistanceMinutes(prevArea, currentArea) > 60) {
      areaOverjumpCount += 1;
    }
  }

  if (areaOverjumpCount >= 2) {
    issues.push("area_overjump");
  }

  const totalMinutes =
    items.length > 0 ? (items[items.length - 1].endSlot - items[0].startSlot) * 30 : 0;

  const activeMinutes = items.reduce((sum, item) => sum + item.durationMinutes, 0);
  const gapMinutes = Math.max(0, totalMinutes - activeMinutes);

  return {
    isFeasible: issues.length === 0,
    issues: Array.from(new Set(issues)),
    totalFatigue,
    totalMinutes,
    activeMinutes,
    gapMinutes,
  };
}

function buildSequenceDiagnostics(params: {
  skeletonType: DaySkeletonType;
  primaryPeak?: PlannedExperience;
  primaryRecovery?: PlannedExperience;
  sequenceEval: SequenceEvaluation;
  notes: string[];
}): SequenceDiagnostics {
  const { skeletonType, primaryPeak, primaryRecovery, sequenceEval, notes } = params;

  return {
    skeletonType,
    selectedPeakId: primaryPeak?.experience.id,
    selectedRecoveryId: primaryRecovery?.experience.id,
    flowScore: sequenceEval.flowScore,
    smoothnessScore: sequenceEval.smoothnessScore,
    fatigueScore: sequenceEval.fatigueScore,
    peakPositionScore: sequenceEval.peakPositionScore,
    recoveryScore: sequenceEval.recoveryScore,
    continuityScore: sequenceEval.continuityScore,
    notes,
  };
}

export function scheduleDayPlan(
  dayPlan: DayPlan,
  input: PlanningInput,
  dayIndex: number,
  totalDays: number,
): { schedule: DaySchedule; diagnostic: DaySchedulingDiagnostic } {
  const flattened = flattenDayPlan(dayPlan);
  const availableMin = computeAvailableMinutes(input);
  const estimatedTotalMin = estimatePlannedMinutes(flattened);
  const overflowMin = Math.max(0, estimatedTotalMin - availableMin);
  const preFeasibilityStatus = toFeasibilityStatus(overflowMin);

  const sequence = buildExperienceSequence({
    dayPlan,
    items: flattened,
    input,
    dayIndex,
    totalDays,
  });

  const sequenceEvalBeforeRepair = evaluateSequenceFlow({
    ordered: sequence.ordered,
    nodes: sequence.nodes,
    skeletonType: sequence.skeletonType,
    input,
    primaryPeak: sequence.primaryPeak,
    primaryRecovery: sequence.primaryRecovery,
  });

  const fitted = fitSequenceToTimeline({
    ordered: sequence.ordered,
    nodes: sequence.nodes,
    input,
  });

  const reserveItems = dayPlan.lateFallbackReserve ?? [];
  const plannedMap = new Map(
    [...flattened, ...reserveItems].map((item) => [item.experience.id, item]),
  );

  const repaired = repairTimeline({
    fitted,
    input,
    skeletonType: sequence.skeletonType,
    primaryPeak: sequence.primaryPeak,
    primaryRecovery: sequence.primaryRecovery,
    plannedMap,
    lateFallbackIds: dayPlan.selection?.lateFallbackIds,
  });

  const repairedOrdered: PlannedExperience[] = repaired.items
    .map((scheduled) => plannedMap.get(scheduled.experienceId))
    .filter((item): item is PlannedExperience => item !== undefined);

  const repairedNodes: ExperienceSequenceNode[] = [];

  for (let index = 0; index < repaired.items.length; index += 1) {
    const item = repaired.items[index];
    const planned = plannedMap.get(item.experienceId);

    if (!planned) {
      continue;
    }

    repairedNodes.push({
      experienceId: item.experienceId,
      placeName: item.placeName,
      priority: item.priority,
      planningTier: item.planningTier,
      functionalRole: item.functionalRole,
      themeCluster: item.themeCluster,
      flowRole:
        item.flowRole ??
        (index === 0
          ? "opener"
          : index === repaired.items.length - 1
            ? "recovery"
            : "support"),
      sequenceIndex: index,
      isPrimaryPeak: item.isPrimaryPeak,
      roleAffinity: computeFlowRoleAffinity(planned),
    });
  }

  const actualRecoveryAfterRepair: PlannedExperience | undefined = (() => {
    const recoveryNode = repairedNodes.find(
      (n) => n.flowRole === "recovery" || n.flowRole === "soft_end",
    );
    if (!recoveryNode) return sequence.primaryRecovery;
    return plannedMap.get(recoveryNode.experienceId) ?? sequence.primaryRecovery;
  })();

  const sequenceEvalAfterRepair = evaluateSequenceFlow({
    ordered: repairedOrdered,
    nodes: repairedNodes,
    skeletonType: sequence.skeletonType,
    input,
    primaryPeak: sequence.primaryPeak,
    primaryRecovery: actualRecoveryAfterRepair,
  });

  const report = evaluateFeasibility(dayPlan, repaired.items, input.dailyEndSlot);

  const scheduledItemCount = repaired.items.length;

  const recoveryPin = dayPlan.pins?.recovery;
  const recoveryPinIsCritical =
    recoveryPin?.confidence === "hard" ||
    sequence.skeletonType === "relaxed" ||
    sequence.skeletonType === "balanced" ||
    toNarrativeType(sequence.skeletonType) === "recovery";

  const missingCriticalRecovery =
    Boolean(recoveryPinIsCritical && sequence.primaryRecovery) &&
    !repaired.timelineDiagnostics.preservedOriginalRecovery &&
    !repaired.timelineDiagnostics.recoveredTailRole;

  const criticalFailure =
    !repaired.timelineDiagnostics.preservedPeak ||
    repaired.timelineDiagnostics.invalidPlacement ||
    scheduledItemCount < 2 ||
    missingCriticalRecovery;

  const onlySoftTimeIssue =
    report.issues.length > 0 &&
    report.issues.every((issue) => issue === "time_window_violation");

  const effectivelyFeasible = report.isFeasible || onlySoftTimeIssue;

  const hasFlowDegradation =
    !criticalFailure &&
    recoveryPinIsCritical &&
    sequence.primaryRecovery &&
    !repaired.timelineDiagnostics.preservedOriginalRecovery;

  const finalStatus = criticalFailure
    ? "partial_fail"
    : hasFlowDegradation
      ? "flow_degraded"
      : repaired.repairs.length > 0
        ? effectivelyFeasible
          ? "repaired"
          : "partial_fail"
        : effectivelyFeasible
          ? "scheduled"
          : "partial_fail";

  const sequenceDiagnostics = buildSequenceDiagnostics({
    skeletonType: sequence.skeletonType,
    primaryPeak: sequence.primaryPeak,
    primaryRecovery: actualRecoveryAfterRepair,
    sequenceEval: sequenceEvalAfterRepair,
    notes: [...sequence.notes, ...sequenceEvalAfterRepair.notes],
  });

  const scheduledItemIds = new Set(repaired.items.map((x) => x.experienceId));
  const plannedItemIds = flattened.map((x) => x.experience.id);
  const notScheduledIds = plannedItemIds.filter((id) => !scheduledItemIds.has(id));

  return {
    schedule: {
      day: dayPlan.day,
      items: repaired.items,
      report,
    },
    diagnostic: {
      dayIndex: dayPlan.day,
      narrativeType: toNarrativeType(sequence.skeletonType),
      skeletonType: sequence.skeletonType,
      primaryPeakId: sequence.primaryPeak?.experience.id,
      primaryRecoveryId: actualRecoveryAfterRepair?.experience.id,
      preFeasibilityStatus,
      estimatedTotalMin,
      availableMin,
      overflowMin,
      flowScoreBeforeRepair: sequenceEvalBeforeRepair.flowScore,
      flowScoreAfterRepair: sequenceEvalAfterRepair.flowScore,
      repairs: repaired.repairs,
      finalStatus,
      sequenceDiagnostics,
      timelineDiagnostics: repaired.timelineDiagnostics,
      notes: [
        `plannedItems=${flattened.length}`,
        `skeleton=${sequence.skeletonType}`,
        `planningTargetItemCount=${dayPlan.selection?.targetItemCount ?? "none"}`,
        `planningHardCap=${dayPlan.selection?.hardCap ?? "none"}`,
        `peak=${sequence.primaryPeak?.experience.id ?? "none"}`,
        `recovery=${actualRecoveryAfterRepair?.experience.id ?? "none"}`,
        `recoveryOriginal=${sequence.primaryRecovery?.experience.id ?? "none"}`,
        `scheduledItems=${repaired.items.length}`,
        `issues=${report.issues.join(",") || "none"}`,
        `effectiveFeasible=${effectivelyFeasible ? "yes" : "no"}`,
        `plannedIds=${plannedItemIds.join(",") || "none"}`,
        `scheduledIds=${Array.from(scheduledItemIds).join(",") || "none"}`,
        `notScheduledIds=${notScheduledIds.join(",") || "none"}`,
        `droppedOptionalIds=${repaired.timelineDiagnostics.droppedOptionalIds.join(",") || "none"}`,
        `compressedIds=${repaired.timelineDiagnostics.compressedExperienceIds.join(",") || "none"}`,
        `substitutedIds=${repaired.timelineDiagnostics.substitutedExperienceIds.join(",") || "none"}`,
        `preservedPeak=${repaired.timelineDiagnostics.preservedPeak}`,
        `preservedOriginalRecovery=${repaired.timelineDiagnostics.preservedOriginalRecovery}`,
        `recoveredTailRole=${repaired.timelineDiagnostics.recoveredTailRole}`,
        `missingCriticalRecovery=${missingCriticalRecovery ? "yes" : "no"}`,
        `invalidPlacement=${repaired.timelineDiagnostics.invalidPlacement}`,
        ...sequence.notes,
        ...sequenceEvalBeforeRepair.notes.map((note) => `before:${note}`),
        ...sequenceEvalAfterRepair.notes.map((note) => `after:${note}`),
        ...repaired.timelineDiagnostics.notes.map((note) => `timeline:${note}`),
      ],
    },
  };
}
