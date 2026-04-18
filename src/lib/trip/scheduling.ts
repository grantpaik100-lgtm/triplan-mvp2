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
 * - recovery는 hard-preserve 대상이다.
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
  const plannedOrder = dayPlan.selection?.selectedOrder ?? dayPlan.roughOrder;
  const orderMap = new Map(plannedOrder.map((id, idx) => [id, idx]));

  return [...dayPlan.anchor, ...dayPlan.core, ...dayPlan.optional].sort((a, b) => {
    return (orderMap.get(a.experience.id) ?? 999) - (orderMap.get(b.experience.id) ?? 999);
  });
}

function estimateTravelMinutes(items: PlannedExperience[]): number {
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

  if (
    input.dailyDensity >= 4 &&
    candidateCount >= 5 &&
    feasibleCapacity >= 5
  ) {
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
  const recovery =
    items.find((item) => item.experience.id === planningRecoveryId) ??
    undefined;
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
  const { ordered, nodes, input, primaryPeak, primaryRecovery } = params;

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

  if (input.companionType === "family") {
    const highFatigueCount = ordered.filter((item) => item.experience.fatigue >= 4).length;
    if (highFatigueCount >= 2) {
      notes.push("family_high_fatigue_risk");
    }
  }

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

  for (let i = 0; i < ordered.length; i += 1) {
    const planned = ordered[i];
    const prev = i > 0 ? ordered[i - 1] : undefined;
    const flowRole = getRoleForItem(planned, nodes);
    const isCriticalRole = isCriticalFlowRole(flowRole);
    const isProtectedRole = isProtectedFlowRole(flowRole);

    const travelMin = prev
      ? getAreaDistanceMinutes(prev.experience.area, planned.experience.area)
      : 0;

    const overflowPressureMin = Math.max(
      0,
      items.length > 0 ? (currentSlot - input.dailyEndSlot) * 30 : 0,
    );

    const earliestSlot = currentSlot + minutesToSlots(travelMin);
    const remainingCriticalMinutes = estimateRemainingCriticalMinutes(ordered, nodes, i);
    const remainingAvailableMinutes = Math.max(
      0,
      (input.dailyEndSlot - earliestSlot) * 30,
    );

    let chosenDuration = chooseDurationMinutes(planned, overflowPressureMin);

    if (
      remainingAvailableMinutes - chosenDuration < remainingCriticalMinutes &&
      !isProtectedRole
    ) {
      chosenDuration = planned.experience.minDuration;
      compressedExperienceIds.push(planned.experience.id);
      notes.push(`reserveCriticalBuffer=${planned.experience.id}`);
    } else if (chosenDuration < planned.experience.recommendedDuration) {
      compressedExperienceIds.push(planned.experience.id);
    }

    const durationSlots = minutesToSlots(chosenDuration);
    const latestStartSlot = Math.max(input.dailyStartSlot, input.dailyEndSlot - durationSlots);

    const startSlot = findFeasibleStartSlot({
      item: planned,
      earliestSlot,
      latestStartSlot,
    });

    if (startSlot === null) {
      if (
        planned.priority === "optional" &&
        !isProtectedRole
      ) {
        droppedOptionalIds.push(planned.experience.id);
        notes.push(`dropOptional=${planned.experience.id}:time_window_mismatch`);
        continue;
      }

      const fallbackStart = findFallbackStartSlot({
        item: planned,
        earliestSlot,
        latestStartSlot,
      });

      if (fallbackStart !== null) {
        const fallbackEnd = fallbackStart + durationSlots;

        if (fallbackEnd <= input.dailyEndSlot) {
          items.push({
            experienceId: planned.experience.id,
            placeName: planned.experience.placeName,
            startSlot: fallbackStart,
            endSlot: fallbackEnd,
            durationMinutes: durationSlots * 30,
            priority: planned.priority,
            planningTier: planned.planningTier,
            functionalRole: planned.functionalRole,
            themeCluster: planned.themeCluster,
            flowRole,
            rhythmSlotType: flowRoleToRhythmSlotType(flowRole),
            isPrimaryPeak: flowRole === "peak",
          });

          currentSlot = fallbackEnd;
          notes.push(`fallbackPlacement=${planned.experience.id}:critical_role=${flowRole}`);
          continue;
        }
      }

      if (isCriticalRole) {
        invalidPlacement = true;
        notes.push(`invalidPlacement=${planned.experience.id}:critical_role=${flowRole}`);
      } else if (isProtectedRole) {
        notes.push(`softMiss=${planned.experience.id}:protected_role=${flowRole}`);
      } else {
        notes.push(`invalidPlacement=${planned.experience.id}:role=${flowRole}`);
      }
      continue;
    }

    const endSlot = startSlot + durationSlots;

    if (
      endSlot > input.dailyEndSlot &&
      planned.priority === "optional" &&
      !isProtectedRole
    ) {
      droppedOptionalIds.push(planned.experience.id);
      notes.push(`dropOptional=${planned.experience.id}:overflow`);
      continue;
    }

    if (endSlot > input.dailyEndSlot) {
      if (isCriticalRole) {
        invalidPlacement = true;
        notes.push(`criticalOverflow=${planned.experience.id}`);
      } else if (isProtectedRole) {
        notes.push(`softOverflow=${planned.experience.id}:protected_role=${flowRole}`);
      } else {
        notes.push(`overflowDrop=${planned.experience.id}`);
      }
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
      flowRole,
      rhythmSlotType: flowRoleToRhythmSlotType(flowRole),
      isPrimaryPeak: flowRole === "peak",
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

    const start = findFeasibleStartSlot({
      item: planned,
      earliestSlot: earliest,
      latestStartSlot: latestStart,
    });

    if (start === null) continue;

    recomputed.push({
      ...base,
      startSlot: start,
      endSlot: start + durationSlots,
    });
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

function tryReinsertCriticalItem(params: {
  working: ScheduledItem[];
  target: PlannedExperience;
  forcedRole: FlowRole;
  input: PlanningInput;
  plannedMap: Map<string, PlannedExperience>;
}): ScheduledItem[] {
  const { working, target, forcedRole, input, plannedMap } = params;

  if (working.some((item) => item.experienceId === target.experience.id)) {
    return working;
  }

  const base = [...working];
  const targetDurationSlots = minutesToSlots(target.experience.minDuration);

  const candidateStart = findFallbackStartSlot({
    item: target,
    earliestSlot: input.dailyStartSlot,
    latestStartSlot: Math.max(input.dailyStartSlot, input.dailyEndSlot - targetDurationSlots),
  });

  if (candidateStart === null) {
    return base;
  }

  base.push({
    experienceId: target.experience.id,
    placeName: target.experience.placeName,
    startSlot: candidateStart,
    endSlot: candidateStart + targetDurationSlots,
    durationMinutes: targetDurationSlots * 30,
    priority: target.priority,
    planningTier: target.planningTier,
    functionalRole: target.functionalRole,
    themeCluster: target.themeCluster,
    flowRole: forcedRole,
    rhythmSlotType: flowRoleToRhythmSlotType(forcedRole),
    isPrimaryPeak: forcedRole === "peak",
  });

  return recomputeSequentialTimeline(base, plannedMap, input);
}

function repairTimeline(params: {
  fitted: TimelineFitResult;
  input: PlanningInput;
  primaryPeak?: PlannedExperience;
  primaryRecovery?: PlannedExperience;
  plannedMap: Map<string, PlannedExperience>;
}): RepairResult {
  const { fitted, input, primaryPeak, primaryRecovery, plannedMap } = params;

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
      working.splice(Math.floor(working.length / 2), 0, peakItem);

      working = recomputeSequentialTimeline(working, plannedMap, input);

      repairs.push({
        step: step++,
        action: "move_peak_earlier",
        targetExperienceId: peakItem.experienceId,
        beforeOverflowMin: initialOverflow,
        afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
        reason: "Protect middle peak positioning",
      });
    }

    if (recoveryIndex >= 0 && peakIndex >= 0 && recoveryIndex <= peakIndex && working.length >= 3) {
      const [recoveryItem] = working.splice(recoveryIndex, 1);
      working.push(recoveryItem);

      working = recomputeSequentialTimeline(working, plannedMap, input);

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

  let overflow = getOverflowMin(working, input.dailyEndSlot);

  if (overflow > 0) {
    const removable = [...working]
      .filter(
        (item) =>
          item.priority === "optional" &&
          !item.isPrimaryPeak &&
          item.flowRole !== "recovery" &&
          item.flowRole !== "soft_end",
      )
      .sort((a, b) => b.durationMinutes - a.durationMinutes);

    for (const target of removable) {
      if (overflow <= 0) break;

      const beforeOverflowMin = overflow;
      working = working.filter((item) => item.experienceId !== target.experienceId);
      working = recomputeSequentialTimeline(working, plannedMap, input);
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
    const trimmed = [...working]
      .filter((item) => !(item.priority === "optional" && item.flowRole !== "recovery" && item.flowRole !== "soft_end"));

    working = tryReinsertCriticalItem({
      working: trimmed,
      target: primaryPeak,
      forcedRole: "peak",
      input,
      plannedMap,
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

  if (primaryRecovery && !hasPreservedRecovery(working, primaryRecovery.experience.id)) {
    const beforeOverflowMin = getOverflowMin(working, input.dailyEndSlot);
    const trimmed = [...working]
      .filter((item) => !(item.priority === "optional" && item.flowRole !== "peak"));

    working = tryReinsertCriticalItem({
      working: trimmed,
      target: primaryRecovery,
      forcedRole: "recovery",
      input,
      plannedMap,
    });

    repairs.push({
      step: step++,
      action: "insert_recovery",
      targetExperienceId: primaryRecovery.experience.id,
      beforeOverflowMin,
      afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
      reason: "Reinsert missing recovery after trimming non-critical support",
    });
  }

  const preservedPeak = hasPreservedPeak(working, primaryPeak?.experience.id);
  const preservedRecovery = primaryRecovery
    ? hasPreservedRecovery(working, primaryRecovery.experience.id)
    : true;

  const timelineDiagnostics: TimelineDiagnostics = {
    overflowMin: overflow,
    invalidPlacement:
      fitted.invalidPlacement ||
      !preservedPeak,
    compressedExperienceIds: Array.from(new Set(compressedExperienceIds)),
    substitutedExperienceIds: [],
    droppedOptionalIds: Array.from(new Set(droppedOptionalIds)),
    preservedPeak,
    preservedRecovery,
    notes,
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

    if (!isAllowedTimeSlot(planned.experience.allowedTimes, item.startSlot)) {
      issues.push("time_window_violation");
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

  const plannedMap = new Map(flattened.map((item) => [item.experience.id, item]));

  const repaired = repairTimeline({
    fitted,
    input,
    primaryPeak: sequence.primaryPeak,
    primaryRecovery: sequence.primaryRecovery,
    plannedMap,
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

  const sequenceEvalAfterRepair = evaluateSequenceFlow({
    ordered: repairedOrdered,
    nodes: repairedNodes,
    skeletonType: sequence.skeletonType,
    input,
    primaryPeak: sequence.primaryPeak,
    primaryRecovery: sequence.primaryRecovery,
  });

  const report = evaluateFeasibility(dayPlan, repaired.items, input.dailyEndSlot);

  const criticalFailure =
    !repaired.timelineDiagnostics.preservedPeak ||
    repaired.timelineDiagnostics.invalidPlacement;

  const finalStatus =
    criticalFailure
      ? "partial_fail"
      : repaired.repairs.length > 0
        ? report.isFeasible
          ? "repaired"
          : "partial_fail"
        : report.isFeasible
          ? "scheduled"
          : "partial_fail";

  const sequenceDiagnostics = buildSequenceDiagnostics({
    skeletonType: sequence.skeletonType,
    primaryPeak: sequence.primaryPeak,
    primaryRecovery: sequence.primaryRecovery,
    sequenceEval: sequenceEvalAfterRepair,
    notes: [...sequence.notes, ...sequenceEvalAfterRepair.notes],
  });

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
      primaryRecoveryId: sequence.primaryRecovery?.experience.id,
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
        `recovery=${sequence.primaryRecovery?.experience.id ?? "none"}`,
        `scheduledItems=${repaired.items.length}`,
        `issues=${report.issues.join(",") || "none"}`,
        ...sequence.notes,
        ...sequenceEvalBeforeRepair.notes.map((note) => `before:${note}`),
        ...sequenceEvalAfterRepair.notes.map((note) => `after:${note}`),
        ...repaired.timelineDiagnostics.notes.map((note) => `timeline:${note}`),
      ],
    },
  };
}
