/**
 * TriPlan V3
 * Current Role:
 * - planning 결과를 시간 순서와 duration, 이동, fatigue, time window 제약에 맞게 실제 일정 시퀀스로 배치하는 scheduling engine file이다.
 *
 * Target Role:
 * - feasible time placement가 아니라 narrative-aware experience flow sequence를 생성하는 공식 scheduling layer가 되어야 한다.
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
 * - V2에서는 rough order 기반 sequential placement를 narrative + rhythm + repair 구조로 재정의한다.
 * - 이번 버전에서는 invalid placement 발생 시 dropped item diagnostics를 기록하고,
 *   opener / peak / recovery 역할 기반 replacement repair를 시도한다.
 */

import { getAreaDistanceMinutes } from "./area";
import { getPreferredStartSlot, isAllowedTimeSlot, minutesToSlots } from "./time";
import type {
  DayNarrativeType,
  DayPlan,
  DaySchedule,
  DaySchedulingDiagnostic,
  FeasibilityReport,
  FeasibilityStatus,
  FlowScoreBreakdown,
  PlannedExperience,
  PlanningInput,
  RepairActionLog,
  RhythmSlotType,
  ScheduleIssue,
  ScheduledItem,
} from "./types";

type NarrativeSlotWindow = {
  slot: RhythmSlotType;
  minSlot: number;
  maxSlot: number;
};

type NarrativeSlotTemplate = {
  windows: NarrativeSlotWindow[];
};

type FlowEvaluation = {
  breakdown: FlowScoreBreakdown;
  notes: string[];
};

type RealizeOptions = {
  ignorePeakPreference?: boolean;
  relaxSlotWindows?: boolean;
};

type DroppedPlacementDiagnostic = {
  experienceId: string;
  placeName: string;
  role: "opener" | "peak" | "recovery" | "optional";
  reason:
    | "time_window_mismatch"
    | "slot_conflict"
    | "travel_overflow"
    | "peak_rule_violation";
  preferredTime?: string;
  allowedTimes?: string[];
  rhythmSlotType?: RhythmSlotType;
};

type TimelineRealization = {
  items: ScheduledItem[];
  hasInvalidPlacement: boolean;
  droppedExperienceIds: string[];
  droppedItems: DroppedPlacementDiagnostic[];
};

const FLOW_WEIGHTS = {
  PEAK: 10,
  FATIGUE: 5,
  TRAVEL: 4,
  DIVERSITY: 4,
  MEAL: 3,
  COMPANION: 4,
} as const;

function flattenDayPlan(dayPlan: DayPlan): PlannedExperience[] {
  const orderMap = new Map(dayPlan.roughOrder.map((id, idx) => [id, idx]));

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

function assignDayNarrativeType(
  dayIndex: number,
  totalDays: number,
): DayNarrativeType {
  if (dayIndex === 0) return "immersion";
  if (dayIndex === totalDays - 1) return "recovery";
  return "peak";
}

function buildNarrativeSlotTemplate(
  narrativeType: DayNarrativeType,
  itemCount: number,
): NarrativeSlotTemplate {
  if (itemCount <= 2) {
    if (narrativeType === "recovery") {
      return {
        windows: [
          { slot: "warm_up", minSlot: 18, maxSlot: 24 },
          { slot: "cool_down", minSlot: 30, maxSlot: 40 },
        ],
      };
    }

    return {
      windows: [
        { slot: "warm_up", minSlot: 18, maxSlot: 24 },
        { slot: "emotional_peak", minSlot: 28, maxSlot: 38 },
      ],
    };
  }

  if (narrativeType === "immersion") {
    return {
      windows: [
        { slot: "warm_up", minSlot: 18, maxSlot: 23 },
        { slot: "activation", minSlot: 22, maxSlot: 29 },
        { slot: "emotional_peak", minSlot: 30, maxSlot: 37 },
        { slot: "cool_down", minSlot: 34, maxSlot: 42 },
      ],
    };
  }

  if (narrativeType === "recovery") {
    return {
      windows: [
        { slot: "warm_up", minSlot: 18, maxSlot: 23 },
        { slot: "activation", minSlot: 22, maxSlot: 28 },
        { slot: "recovery", minSlot: 26, maxSlot: 34 },
        { slot: "cool_down", minSlot: 32, maxSlot: 40 },
      ],
    };
  }

  return {
    windows: [
      { slot: "warm_up", minSlot: 18, maxSlot: 23 },
      { slot: "activation", minSlot: 22, maxSlot: 29 },
      { slot: "emotional_peak", minSlot: 30, maxSlot: 37 },
      { slot: "recovery", minSlot: 34, maxSlot: 40 },
      { slot: "cool_down", minSlot: 36, maxSlot: 44 },
    ],
  };
}

function getWindowMap(template: NarrativeSlotTemplate): Map<RhythmSlotType, NarrativeSlotWindow> {
  return new Map(template.windows.map((window) => [window.slot, window]));
}

function scorePeakCandidate(item: PlannedExperience): number {
  let score = item.planningScore;
  const selectionTags = item.selectionReason?.tags ?? [];

  if (item.priority === "anchor") score += 100;
  if (selectionTags.includes("must_place")) score += 15;
  if (selectionTags.includes("must_experience")) score += 15;
  if (item.experience.preferredTime === "sunset") score += 10;
  if (item.experience.preferredTime === "night") score += 8;
  if (item.experience.isNightFriendly) score += 8;
  if (item.experience.isMeal) score += 4;
  if (item.themeCluster === "night_view") score += 6;

  return score;
}

function selectPrimaryPeak(items: PlannedExperience[]): PlannedExperience | undefined {
  if (items.length === 0) return undefined;
  return [...items].sort((a, b) => scorePeakCandidate(b) - scorePeakCandidate(a))[0];
}

function isRecoveryCandidate(item: PlannedExperience): boolean {
  const placeType = item.experience.placeType ?? "";

  return (
    item.functionalRole === "rest" ||
    item.functionalRole === "transition_safe" ||
    placeType.toLowerCase().includes("cafe") ||
    item.experience.features.quiet >= 0.6 ||
    item.themeCluster === "cafe_relax" ||
    item.themeCluster === "walk_local"
  );
}

function classifyRhythmSlot(
  item: PlannedExperience,
  narrativeType: DayNarrativeType,
  primaryPeakId?: string,
): RhythmSlotType {
  if (item.experience.id === primaryPeakId) return "emotional_peak";

  if (isRecoveryCandidate(item)) {
    return narrativeType === "recovery" ? "recovery" : "cool_down";
  }

  if (item.experience.isMeal && item.priority !== "optional") {
    return narrativeType === "immersion" ? "activation" : "cool_down";
  }

  if (item.priority === "anchor") return "activation";

  if (item.priority === "optional") {
    return narrativeType === "recovery" ? "cool_down" : "recovery";
  }

  return "activation";
}

function assignToRhythmSlots(
  items: PlannedExperience[],
  narrativeType: DayNarrativeType,
  primaryPeakId?: string,
): ScheduledItem[] {
  const template = buildNarrativeSlotTemplate(narrativeType, items.length);
  const slotOrder = new Map(template.windows.map((window, idx) => [window.slot, idx]));

  const slotted = items.map((item) => ({
    planned: item,
    slot: classifyRhythmSlot(item, narrativeType, primaryPeakId),
  }));

  slotted.sort((a, b) => {
    const slotDiff = (slotOrder.get(a.slot) ?? 999) - (slotOrder.get(b.slot) ?? 999);
    if (slotDiff !== 0) return slotDiff;

    if (a.planned.experience.id === primaryPeakId) return -1;
    if (b.planned.experience.id === primaryPeakId) return 1;

    return b.planned.planningScore - a.planned.planningScore;
  });

  const firstActivationIndex = slotted.findIndex(
    (item) =>
      item.slot === "activation" &&
      item.planned.experience.id !== primaryPeakId &&
      !item.planned.experience.isMeal,
  );

  if (firstActivationIndex >= 0) {
    slotted[firstActivationIndex] = {
      ...slotted[firstActivationIndex],
      slot: "warm_up",
    };
  }

  return slotted.map(({ planned, slot }) => ({
    experienceId: planned.experience.id,
    placeName: planned.experience.placeName,
    startSlot: 0,
    endSlot: 0,
    durationMinutes: planned.experience.recommendedDuration,
    priority: planned.priority,
    planningTier: planned.planningTier,
    functionalRole: planned.functionalRole,
    themeCluster: planned.themeCluster,
    rhythmSlotType: slot,
    isPrimaryPeak: planned.experience.id === primaryPeakId,
  }));
}

function getWindowCenter(window?: NarrativeSlotWindow): number {
  if (!window) return 24;
  return Math.floor((window.minSlot + window.maxSlot) / 2);
}

function collectAllowedSlots(
  planned: PlannedExperience,
  fromSlot: number,
  toSlot: number,
): number[] {
  const allowed: number[] = [];

  for (let slot = fromSlot; slot <= toSlot; slot += 1) {
    if (isAllowedTimeSlot(planned.experience.allowedTimes, slot)) {
      allowed.push(slot);
    }
  }

  return allowed;
}

function pickBestSlot(
  candidates: number[],
  targetSlot: number,
): number | undefined {
  if (candidates.length === 0) return undefined;

  return [...candidates].sort((a, b) => {
    return Math.abs(a - targetSlot) - Math.abs(b - targetSlot);
  })[0];
}

function findBestStartSlot(
  planned: PlannedExperience,
  earliestSlot: number,
  latestSlot: number,
  window: NarrativeSlotWindow | undefined,
  options: {
    preferredTargetSlot?: number;
    relaxSlotWindows?: boolean;
  },
): number | null {
  const boundedEarliest = Math.max(earliestSlot, 0);
  const boundedLatest = Math.max(boundedEarliest, latestSlot);

  const windowMin = options.relaxSlotWindows
    ? boundedEarliest
    : Math.max(boundedEarliest, window?.minSlot ?? boundedEarliest);

  const windowMax = options.relaxSlotWindows
    ? boundedLatest
    : Math.min(boundedLatest, window?.maxSlot ?? boundedLatest);

  const targetSlot =
    options.preferredTargetSlot ??
    getWindowCenter(window);

  const windowCandidates = collectAllowedSlots(planned, windowMin, windowMax);
  const fromWindow = pickBestSlot(windowCandidates, targetSlot);
  if (fromWindow !== undefined) return fromWindow;

  const fullCandidates = collectAllowedSlots(planned, boundedEarliest, boundedLatest);
  const fromFull = pickBestSlot(fullCandidates, targetSlot);
  if (fromFull !== undefined) return fromFull;

  return null;
}

function inferDroppedRole(
  item: ScheduledItem,
  realizedCount: number,
  primaryPeakId?: string,
): DroppedPlacementDiagnostic["role"] {
  // 1. rhythm slot 기준 우선 판정
  if (item.rhythmSlotType === "warm_up") {
    return "opener";
  }

  if (
    item.rhythmSlotType === "recovery" ||
    item.rhythmSlotType === "cool_down"
  ) {
    return "recovery";
  }

  if (item.rhythmSlotType === "emotional_peak") {
    return "peak";
  }

  // 2. peak explicit fallback
  if (
    item.experienceId === primaryPeakId ||
    item.isPrimaryPeak
  ) {
    return "peak";
  }

  // 3. first unresolved item fallback
  if (realizedCount === 0) {
    return "opener";
  }

  // 4. optional fallback
  return "optional";
}

function inferDroppedReason(params: {
  planned: PlannedExperience;
  earliestSlot: number;
  latestStartSlot: number;
  slotWindow: NarrativeSlotWindow | undefined;
  preferredTargetSlot?: number;
  relaxSlotWindows?: boolean;
}): DroppedPlacementDiagnostic["reason"] {
  const {
    planned,
    earliestSlot,
    latestStartSlot,
    slotWindow,
    preferredTargetSlot,
    relaxSlotWindows,
  } = params;

  if (earliestSlot > latestStartSlot) {
    return "travel_overflow";
  }

  const boundedEarliest = Math.max(earliestSlot, 0);
  const boundedLatest = Math.max(boundedEarliest, latestStartSlot);

  const windowMin = relaxSlotWindows
    ? boundedEarliest
    : Math.max(boundedEarliest, slotWindow?.minSlot ?? boundedEarliest);

  const windowMax = relaxSlotWindows
    ? boundedLatest
    : Math.min(boundedLatest, slotWindow?.maxSlot ?? boundedLatest);

  const windowCandidates = collectAllowedSlots(planned, windowMin, windowMax);
  if (windowCandidates.length > 0) {
    return "slot_conflict";
  }

  const fullCandidates = collectAllowedSlots(planned, boundedEarliest, boundedLatest);
  if (fullCandidates.length > 0) {
    if (preferredTargetSlot !== undefined) {
      return "peak_rule_violation";
    }
    return "slot_conflict";
  }

  return "time_window_mismatch";
}

function realizeTimeline(
  slotted: ScheduledItem[],
  plannedMap: Map<string, PlannedExperience>,
  template: NarrativeSlotTemplate,
  dayStartSlot: number,
  dayEndSlot: number,
  options?: RealizeOptions,
): TimelineRealization {
  const windowMap = getWindowMap(template);
  const realized: ScheduledItem[] = [];
  const droppedExperienceIds: string[] = [];
  const droppedItems: DroppedPlacementDiagnostic[] = [];
  let hasInvalidPlacement = false;

  for (const item of slotted) {
    const planned = plannedMap.get(item.experienceId);
    if (!planned) continue;

    const durationSlots = minutesToSlots(item.durationMinutes);
    const prev = realized[realized.length - 1];

    const prevArea = prev
      ? plannedMap.get(prev.experienceId)?.experience.area ?? planned.experience.area
      : planned.experience.area;

    const travelMinutes = prev
      ? getAreaDistanceMinutes(prevArea, planned.experience.area)
      : 0;

    const earliestSlot = prev
      ? prev.endSlot + minutesToSlots(travelMinutes)
      : dayStartSlot;

    const latestStartSlot = Math.max(dayStartSlot, dayEndSlot - durationSlots);
    const slotWindow = item.rhythmSlotType
      ? windowMap.get(item.rhythmSlotType)
      : undefined;

    const preferredTargetSlot =
      item.isPrimaryPeak && !options?.ignorePeakPreference
        ? getPreferredStartSlot(planned.experience.preferredTime)
        : undefined;

    const startSlot = findBestStartSlot(
      planned,
      earliestSlot,
      latestStartSlot,
      slotWindow,
      {
        preferredTargetSlot,
        relaxSlotWindows: options?.relaxSlotWindows ?? false,
      },
    );

    if (startSlot === null) {
      hasInvalidPlacement = true;
      droppedExperienceIds.push(item.experienceId);
      droppedItems.push({
        experienceId: item.experienceId,
        placeName: item.placeName,
        role: inferDroppedRole(item, realized.length, planned.experience.id),
        reason: inferDroppedReason({
          planned,
          earliestSlot,
          latestStartSlot,
          slotWindow,
          preferredTargetSlot,
          relaxSlotWindows: options?.relaxSlotWindows ?? false,
        }),
        preferredTime: planned.experience.preferredTime,
        allowedTimes: planned.experience.allowedTimes ?? [],
        rhythmSlotType: item.rhythmSlotType,
      });
      continue;
    }

    realized.push({
      ...item,
      startSlot,
      endSlot: startSlot + durationSlots,
    });
  }

  return {
    items: realized,
    hasInvalidPlacement,
    droppedExperienceIds,
    droppedItems,
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

  if (totalFatigue > 15) {
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
    items.length > 0
      ? (items[items.length - 1].endSlot - items[0].startSlot) * 30
      : 0;

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

function evaluateFlowQuality(
  dayPlan: DayPlan,
  items: ScheduledItem[],
  input: PlanningInput,
  primaryPeakId?: string,
): FlowEvaluation {
  const plannedItems = [...dayPlan.anchor, ...dayPlan.core, ...dayPlan.optional];
  const plannedMap = new Map(plannedItems.map((item) => [item.experience.id, item]));

  let peakReward = 0;
  let fatiguePenalty = 0;
  let travelPenalty = 0;
  let diversityReward = 0;
  let mealBalanceReward = 0;
  let companionReward = 0;

  const notes: string[] = [];

  const peakIndex = items.findIndex((item) => item.experienceId === primaryPeakId);
  if (peakIndex >= 0) {
    peakReward += FLOW_WEIGHTS.PEAK;
    if (peakIndex > 0 && peakIndex < items.length - 1) {
      peakReward += 4;
      notes.push("peak_position=centered");
    } else {
      notes.push("peak_position=edge");
    }
  }

  let consecutiveHighFatiguePairs = 0;

  for (let i = 0; i < items.length; i += 1) {
    const current = plannedMap.get(items[i].experienceId);
    if (!current) continue;

    if (current.experience.fatigue >= 4) {
      fatiguePenalty += FLOW_WEIGHTS.FATIGUE;
      if (i > 0) {
        const prev = plannedMap.get(items[i - 1].experienceId);
        if (prev && prev.experience.fatigue >= 4) {
          consecutiveHighFatiguePairs += 1;
        }
      }
    }

    if (current.experience.isMeal) {
      mealBalanceReward += FLOW_WEIGHTS.MEAL;
    }

    if (isRecoveryCandidate(current)) {
      diversityReward += 1;
    }

    if (input.companionType === "couple" && current.experience.isNightFriendly) {
      companionReward += FLOW_WEIGHTS.COMPANION;
    }

    if (input.companionType === "family" && current.experience.fatigue >= 4) {
      fatiguePenalty += 2;
    }
  }

  fatiguePenalty += consecutiveHighFatiguePairs * 6;
  if (consecutiveHighFatiguePairs > 0) {
    notes.push(`fatigue_burst=${consecutiveHighFatiguePairs}`);
  }

  for (let i = 1; i < items.length; i += 1) {
    const prev = plannedMap.get(items[i - 1].experienceId);
    const current = plannedMap.get(items[i].experienceId);
    if (!prev || !current) continue;

    const travel = getAreaDistanceMinutes(prev.experience.area, current.experience.area);
    travelPenalty += Math.floor(travel / 15) * FLOW_WEIGHTS.TRAVEL;

    if (travel >= 45) {
      notes.push(`long_jump=${prev.experience.id}->${current.experience.id}`);
    }

    if (prev.themeCluster !== current.themeCluster) {
      diversityReward += FLOW_WEIGHTS.DIVERSITY;
    }

    if (prev.experience.isIndoor !== current.experience.isIndoor) {
      diversityReward += 1;
    }
  }

  const total =
    peakReward +
    diversityReward +
    mealBalanceReward +
    companionReward -
    fatiguePenalty -
    travelPenalty;

  return {
    breakdown: {
      peakReward,
      fatiguePenalty,
      travelPenalty,
      diversityReward,
      mealBalanceReward,
      companionReward,
      total,
    },
    notes,
  };
}

function getOverflowMin(items: ScheduledItem[], dayEndSlot: number): number {
  if (items.length === 0) return 0;
  return Math.max(0, (items[items.length - 1].endSlot - dayEndSlot) * 30);
}

function removeOptionalItems(
  dayPlan: DayPlan,
  items: ScheduledItem[],
): { items: ScheduledItem[]; removedIds: string[] } {
  const optionalIds = new Set(dayPlan.optional.map((x) => x.experience.id));

  return {
    items: items.filter((item) => !optionalIds.has(item.experienceId)),
    removedIds: items
      .filter((item) => optionalIds.has(item.experienceId))
      .map((item) => item.experienceId),
  };
}

function dropLowestValueCore(
  dayPlan: DayPlan,
  items: ScheduledItem[],
): { items: ScheduledItem[]; removedId?: string } {
  const coreIds = new Set(dayPlan.core.map((item) => item.experience.id));
  const dropCandidate = [...items]
    .filter((item) => coreIds.has(item.experienceId) && !item.isPrimaryPeak)
    .sort((a, b) => a.durationMinutes - b.durationMinutes)[0];

  if (!dropCandidate) {
    return { items };
  }

  return {
    items: items.filter((item) => item.experienceId !== dropCandidate.experienceId),
    removedId: dropCandidate.experienceId,
  };
}

function moveRecoveryEarlier(items: ScheduledItem[]): { items: ScheduledItem[]; movedId?: string } {
  const recoveryIndex = items.findIndex((item) => item.rhythmSlotType === "recovery");
  if (recoveryIndex <= 1) return { items };

  const copied = [...items];
  const [recoveryItem] = copied.splice(recoveryIndex, 1);
  copied.splice(2, 0, recoveryItem);

  return {
    items: copied,
    movedId: recoveryItem.experienceId,
  };
}

function movePeakEarlier(items: ScheduledItem[]): { items: ScheduledItem[]; movedId?: string } {
  const peakIndex = items.findIndex((item) => item.isPrimaryPeak);
  if (peakIndex <= 1) return { items };

  const copied = [...items];
  const [peakItem] = copied.splice(peakIndex, 1);
  copied.splice(1, 0, peakItem);

  return {
    items: copied,
    movedId: peakItem.experienceId,
  };
}

function hasConsecutiveHighFatigue(
  items: ScheduledItem[],
  plannedMap: Map<string, PlannedExperience>,
): boolean {
  for (let i = 1; i < items.length; i += 1) {
    const prev = plannedMap.get(items[i - 1].experienceId);
    const current = plannedMap.get(items[i].experienceId);

    if (prev && current && prev.experience.fatigue >= 4 && current.experience.fatigue >= 4) {
      return true;
    }
  }

  return false;
}

function getFirstStartSlot(items: ScheduledItem[]): number {
  if (items.length === 0) return 48;
  return items[0].startSlot;
}

function hasCenteredPeak(items: ScheduledItem[], primaryPeakId?: string): boolean {
  if (!primaryPeakId) return false;

  const peakIndex = items.findIndex((item) => item.experienceId === primaryPeakId);
  if (peakIndex < 0) return false;

  return peakIndex > 0 && peakIndex < items.length - 1;
}

function isRepairCandidateAcceptable(params: {
  beforeItems: ScheduledItem[];
  afterItems: ScheduledItem[];
  beforeFlow: FlowEvaluation;
  afterFlow: FlowEvaluation;
  primaryPeakId?: string;
  invalidPlacement?: boolean;
  narrativeType: DayNarrativeType;
}): boolean {
  const {
    beforeItems,
    afterItems,
    beforeFlow,
    afterFlow,
    primaryPeakId,
    invalidPlacement,
    narrativeType,
  } = params;

  if (invalidPlacement) return false;

  if (afterFlow.breakdown.total < beforeFlow.breakdown.total) {
    return false;
  }

  const beforeCentered = hasCenteredPeak(beforeItems, primaryPeakId);
  const afterCentered = hasCenteredPeak(afterItems, primaryPeakId);

  if (beforeCentered && !afterCentered) {
    return false;
  }

  if ((narrativeType === "immersion" || narrativeType === "peak") && afterItems.length < 3) {
    return false;
  }

  if (getFirstStartSlot(afterItems) > getFirstStartSlot(beforeItems)) {
    return false;
  }

  return true;
}

function getRoleCoverage(items: ScheduledItem[], primaryPeakId?: string) {
  return {
    hasWarmUp: items.some((item) => item.rhythmSlotType === "warm_up"),
    hasPeak: items.some((item) => item.experienceId === primaryPeakId),
    hasRecovery: items.some(
      (item) => item.rhythmSlotType === "recovery" || item.rhythmSlotType === "cool_down",
    ),
  };
}

function getRemovableItems(items: ScheduledItem[], primaryPeakId?: string): ScheduledItem[] {
  return [...items]
    .filter((item) => !item.isPrimaryPeak && item.experienceId !== primaryPeakId)
    .sort((a, b) => {
      const aScore = a.priority === "optional" ? 100 : a.priority === "core" ? 50 : 0;
      const bScore = b.priority === "optional" ? 100 : b.priority === "core" ? 50 : 0;
      return bScore - aScore;
    });
}

function buildReplacementCandidates(
  allSlotted: ScheduledItem[],
  currentItems: ScheduledItem[],
): ScheduledItem[] {
  const usedIds = new Set(currentItems.map((item) => item.experienceId));

  return allSlotted.filter((item) => !usedIds.has(item.experienceId));
}

function sortByBaseOrder(items: ScheduledItem[], allSlotted: ScheduledItem[]): ScheduledItem[] {
  const orderMap = new Map(allSlotted.map((item, idx) => [item.experienceId, idx]));
  return [...items].sort(
    (a, b) => (orderMap.get(a.experienceId) ?? 999) - (orderMap.get(b.experienceId) ?? 999),
  );
}

function rolePriorityForCandidate(
  candidate: ScheduledItem,
  neededRole: "opener" | "peak" | "recovery" | "optional",
  primaryPeakId?: string,
): number {
  if (neededRole === "peak") {
    if (candidate.experienceId === primaryPeakId || candidate.isPrimaryPeak || candidate.priority === "anchor") {
      return 100;
    }
    return 0;
  }

  if (neededRole === "opener") {
    if (candidate.rhythmSlotType === "warm_up") return 100;
    if (candidate.rhythmSlotType === "activation") return 60;
    return 0;
  }

  if (neededRole === "recovery") {
    if (candidate.rhythmSlotType === "recovery" || candidate.rhythmSlotType === "cool_down") return 100;
    if (candidate.functionalRole === "rest" || candidate.functionalRole === "meal") return 60;
    return 0;
  }

  return candidate.priority === "optional" ? 100 : 10;
}

function sortReplacementCandidatesByNeededRole(
  candidates: ScheduledItem[],
  neededRole: "opener" | "peak" | "recovery" | "optional",
  primaryPeakId?: string,
): ScheduledItem[] {
  return [...candidates].sort((a, b) => {
    return (
      rolePriorityForCandidate(b, neededRole, primaryPeakId) -
      rolePriorityForCandidate(a, neededRole, primaryPeakId)
    );
  });
}

function getCriticalDroppedRole(
  droppedItems: DroppedPlacementDiagnostic[],
): "opener" | "peak" | "recovery" | "optional" | null {
  if (droppedItems.some((item) => item.role === "opener")) return "opener";
  if (droppedItems.some((item) => item.role === "peak")) return "peak";
  if (droppedItems.some((item) => item.role === "recovery")) return "recovery";
  if (droppedItems.length > 0) return "optional";
  return null;
}

function getRepairActionForRole(
  role: "opener" | "peak" | "recovery" | "optional" | null,
): RepairActionLog["action"] {
  if (role === "peak") return "replace_meal";
  if (role === "recovery") return "replace_meal";
  if (role === "opener") return "replace_meal";
  return "replace_meal";
}

function tryReplacementRepair(params: {
  currentItems: ScheduledItem[];
  allSlotted: ScheduledItem[];
  plannedMap: Map<string, PlannedExperience>;
  template: NarrativeSlotTemplate;
  input: PlanningInput;
  dayPlan: DayPlan;
  primaryPeakId?: string;
  narrativeType: DayNarrativeType;
  droppedItems: DroppedPlacementDiagnostic[];
}): {
  accepted: boolean;
  result?: TimelineRealization;
  replacedOutId?: string;
  replacedInId?: string;
  targetedRole?: "opener" | "peak" | "recovery" | "optional" | null;
} {
  const removable = getRemovableItems(params.currentItems, params.primaryPeakId);
  const currentCoverage = getRoleCoverage(params.currentItems, params.primaryPeakId);
  const targetedRole = getCriticalDroppedRole(params.droppedItems);

  const replacements = sortReplacementCandidatesByNeededRole(
    buildReplacementCandidates(params.allSlotted, params.currentItems),
    targetedRole ?? "optional",
    params.primaryPeakId,
  );

  for (const candidate of replacements) {
    for (const target of removable) {
      const swapped = sortByBaseOrder(
        [
          ...params.currentItems.filter((item) => item.experienceId !== target.experienceId),
          candidate,
        ],
        params.allSlotted,
      );

      const swappedCoverage = getRoleCoverage(swapped, params.primaryPeakId);

      if (!currentCoverage.hasWarmUp && !swappedCoverage.hasWarmUp) continue;
      if (!currentCoverage.hasRecovery && !swappedCoverage.hasRecovery) continue;
      if (!currentCoverage.hasPeak && !swappedCoverage.hasPeak) continue;

      const retimed = realizeTimeline(
        swapped,
        params.plannedMap,
        params.template,
        params.input.dailyStartSlot,
        params.input.dailyEndSlot,
        { ignorePeakPreference: true, relaxSlotWindows: true },
      );

      const beforeFlow = evaluateFlowQuality(
        params.dayPlan,
        params.currentItems,
        params.input,
        params.primaryPeakId,
      );
      const afterFlow = evaluateFlowQuality(
        params.dayPlan,
        retimed.items,
        params.input,
        params.primaryPeakId,
      );

      if (
        isRepairCandidateAcceptable({
          beforeItems: params.currentItems,
          afterItems: retimed.items,
          beforeFlow,
          afterFlow,
          primaryPeakId: params.primaryPeakId,
          invalidPlacement: retimed.hasInvalidPlacement,
          narrativeType: params.narrativeType,
        })
      ) {
        return {
          accepted: true,
          result: retimed,
          replacedOutId: target.experienceId,
          replacedInId: candidate.experienceId,
          targetedRole,
        };
      }
    }
  }

  return { accepted: false, targetedRole };
}

function repairScheduleFlow(
  dayPlan: DayPlan,
  allSlotted: ScheduledItem[],
  initialTimeline: TimelineRealization,
  plannedMap: Map<string, PlannedExperience>,
  template: NarrativeSlotTemplate,
  input: PlanningInput,
  narrativeType: DayNarrativeType,
  primaryPeakId?: string,
): {
  items: ScheduledItem[];
  repairs: RepairActionLog[];
  flowBefore: FlowEvaluation;
  flowAfter: FlowEvaluation;
  hadInvalidPlacement: boolean;
  finalDroppedItems: DroppedPlacementDiagnostic[];
  initialDroppedItems: DroppedPlacementDiagnostic[];
} {
  const flowBefore = evaluateFlowQuality(dayPlan, initialTimeline.items, input, primaryPeakId);
  let working = [...initialTimeline.items];
  let hadInvalidPlacement = initialTimeline.hasInvalidPlacement;
  let currentDroppedItems = [...initialTimeline.droppedItems];
  const initialDroppedItems = [...initialTimeline.droppedItems];
  const repairs: RepairActionLog[] = [];
  let step = 1;

  let overflowBefore = getOverflowMin(working, input.dailyEndSlot);

  if (initialTimeline.droppedExperienceIds.length > 0) {
    const replacement = tryReplacementRepair({
      currentItems: working,
      allSlotted,
      plannedMap,
      template,
      input,
      dayPlan,
      primaryPeakId,
      narrativeType,
      droppedItems: initialTimeline.droppedItems,
    });

    if (replacement.accepted && replacement.result) {
      working = replacement.result.items;
      hadInvalidPlacement = hadInvalidPlacement || replacement.result.hasInvalidPlacement;
      currentDroppedItems = replacement.result.droppedItems;

      repairs.push({
        step: step++,
        action: getRepairActionForRole(replacement.targetedRole ?? null),
        targetExperienceId: replacement.replacedInId,
        reason: `Replace dropped ${replacement.targetedRole ?? "optional"} by swapping out ${replacement.replacedOutId ?? "unknown"}`,
        beforeOverflowMin: overflowBefore,
        afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
      });

      overflowBefore = getOverflowMin(working, input.dailyEndSlot);
    }
  }

  const relaxedTimeline = realizeTimeline(
    working,
    plannedMap,
    template,
    input.dailyStartSlot,
    input.dailyEndSlot,
    {
      ignorePeakPreference: true,
      relaxSlotWindows: true,
    },
  );

  const beforeFlowForRelax = evaluateFlowQuality(dayPlan, working, input, primaryPeakId);
  const afterFlowForRelax = evaluateFlowQuality(dayPlan, relaxedTimeline.items, input, primaryPeakId);

  if (
    isRepairCandidateAcceptable({
      beforeItems: working,
      afterItems: relaxedTimeline.items,
      beforeFlow: beforeFlowForRelax,
      afterFlow: afterFlowForRelax,
      primaryPeakId,
      invalidPlacement: relaxedTimeline.hasInvalidPlacement,
      narrativeType,
    })
  ) {
    working = relaxedTimeline.items;
    hadInvalidPlacement = hadInvalidPlacement || relaxedTimeline.hasInvalidPlacement;
    currentDroppedItems = relaxedTimeline.droppedItems;

    repairs.push({
      step: step++,
      action: "trim_transition",
      targetExperienceId: primaryPeakId,
      reason: "Retimed with relaxed slot windows and softer peak preference",
      beforeOverflowMin: overflowBefore,
      afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
    });

    overflowBefore = getOverflowMin(working, input.dailyEndSlot);
  }

  const peakIndex = working.findIndex((item) => item.experienceId === primaryPeakId);
  if (peakIndex >= 3) {
    const moved = movePeakEarlier(working);
    if (moved.movedId) {
      const retimed = realizeTimeline(
        moved.items,
        plannedMap,
        template,
        input.dailyStartSlot,
        input.dailyEndSlot,
        { ignorePeakPreference: true },
      );

      const beforeFlow = evaluateFlowQuality(dayPlan, working, input, primaryPeakId);
      const afterFlow = evaluateFlowQuality(dayPlan, retimed.items, input, primaryPeakId);

      if (
        isRepairCandidateAcceptable({
          beforeItems: working,
          afterItems: retimed.items,
          beforeFlow,
          afterFlow,
          primaryPeakId,
          invalidPlacement: retimed.hasInvalidPlacement,
          narrativeType,
        })
      ) {
        working = retimed.items;
        hadInvalidPlacement = hadInvalidPlacement || retimed.hasInvalidPlacement;
        currentDroppedItems = retimed.droppedItems;

        repairs.push({
          step: step++,
          action: "move_peak_earlier",
          targetExperienceId: moved.movedId,
          reason: "Protect primary peak from late burial",
          beforeOverflowMin: overflowBefore,
          afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
        });

        overflowBefore = getOverflowMin(working, input.dailyEndSlot);
      }
    }
  }

  if (hasConsecutiveHighFatigue(working, plannedMap)) {
    const moved = moveRecoveryEarlier(working);
    if (moved.movedId) {
      const retimed = realizeTimeline(
        moved.items,
        plannedMap,
        template,
        input.dailyStartSlot,
        input.dailyEndSlot,
        { ignorePeakPreference: true },
      );

      const beforeFlow = evaluateFlowQuality(dayPlan, working, input, primaryPeakId);
      const afterFlow = evaluateFlowQuality(dayPlan, retimed.items, input, primaryPeakId);

      if (
        isRepairCandidateAcceptable({
          beforeItems: working,
          afterItems: retimed.items,
          beforeFlow,
          afterFlow,
          primaryPeakId,
          invalidPlacement: retimed.hasInvalidPlacement,
          narrativeType,
        })
      ) {
        working = retimed.items;
        hadInvalidPlacement = hadInvalidPlacement || retimed.hasInvalidPlacement;
        currentDroppedItems = retimed.droppedItems;

        repairs.push({
          step: step++,
          action: "insert_recovery",
          targetExperienceId: moved.movedId,
          reason: "Move recovery item earlier after fatigue burst",
          beforeOverflowMin: overflowBefore,
          afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
        });

        overflowBefore = getOverflowMin(working, input.dailyEndSlot);
      }
    }
  }

  if (overflowBefore > 0) {
    const removed = removeOptionalItems(dayPlan, working);
    if (removed.removedIds.length > 0) {
      const retimed = realizeTimeline(
        removed.items,
        plannedMap,
        template,
        input.dailyStartSlot,
        input.dailyEndSlot,
        { ignorePeakPreference: true },
      );

      const beforeFlow = evaluateFlowQuality(dayPlan, working, input, primaryPeakId);
      const afterFlow = evaluateFlowQuality(dayPlan, retimed.items, input, primaryPeakId);

      if (
        isRepairCandidateAcceptable({
          beforeItems: working,
          afterItems: retimed.items,
          beforeFlow,
          afterFlow,
          primaryPeakId,
          invalidPlacement: retimed.hasInvalidPlacement,
          narrativeType,
        })
      ) {
        working = retimed.items;
        hadInvalidPlacement = hadInvalidPlacement || retimed.hasInvalidPlacement;
        currentDroppedItems = retimed.droppedItems;

        repairs.push({
          step: step++,
          action: "remove_optional",
          reason: "Remove optional items only after replacement and retime repairs fail",
          beforeOverflowMin: overflowBefore,
          afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
        });

        overflowBefore = getOverflowMin(working, input.dailyEndSlot);
      }
    }
  }

  if (overflowBefore > 0) {
    const dropped = dropLowestValueCore(dayPlan, working);
    if (dropped.removedId) {
      const retimed = realizeTimeline(
        dropped.items,
        plannedMap,
        template,
        input.dailyStartSlot,
        input.dailyEndSlot,
        { ignorePeakPreference: true },
      );

      const beforeFlow = evaluateFlowQuality(dayPlan, working, input, primaryPeakId);
      const afterFlow = evaluateFlowQuality(dayPlan, retimed.items, input, primaryPeakId);

      if (
        isRepairCandidateAcceptable({
          beforeItems: working,
          afterItems: retimed.items,
          beforeFlow,
          afterFlow,
          primaryPeakId,
          invalidPlacement: retimed.hasInvalidPlacement,
          narrativeType,
        })
      ) {
        working = retimed.items;
        hadInvalidPlacement = hadInvalidPlacement || retimed.hasInvalidPlacement;
        currentDroppedItems = retimed.droppedItems;

        repairs.push({
          step: step++,
          action: "remove_core",
          targetExperienceId: dropped.removedId,
          reason: "Still overflow after optional removal, drop the least valuable core",
          beforeOverflowMin: overflowBefore,
          afterOverflowMin: getOverflowMin(working, input.dailyEndSlot),
        });

        overflowBefore = getOverflowMin(working, input.dailyEndSlot);
      }
    }
  }

  const flowAfter = evaluateFlowQuality(dayPlan, working, input, primaryPeakId);

  return {
    items: working,
    repairs,
    flowBefore,
    flowAfter,
    hadInvalidPlacement,
    finalDroppedItems: currentDroppedItems,
    initialDroppedItems,
  };
}

export function scheduleDayPlan(
  dayPlan: DayPlan,
  input: PlanningInput,
  dayIndex: number,
  totalDays: number,
): { schedule: DaySchedule; diagnostic: DaySchedulingDiagnostic } {
  const flattened = flattenDayPlan(dayPlan);
  const availableMin = (input.dailyEndSlot - input.dailyStartSlot) * 30;
  const estimatedTotalMin = estimatePlannedMinutes(flattened);
  const overflowMin = Math.max(0, estimatedTotalMin - availableMin);

  const narrativeType = assignDayNarrativeType(dayIndex, totalDays);
  const primaryPeak = selectPrimaryPeak(flattened);
  const template = buildNarrativeSlotTemplate(narrativeType, flattened.length);
  const plannedMap = new Map(flattened.map((item) => [item.experience.id, item]));

  const slotted = assignToRhythmSlots(
    flattened,
    narrativeType,
    primaryPeak?.experience.id,
  );

  const timedResult = realizeTimeline(
    slotted,
    plannedMap,
    template,
    input.dailyStartSlot,
    input.dailyEndSlot,
  );

  const repaired = repairScheduleFlow(
    dayPlan,
    slotted,
    timedResult,
    plannedMap,
    template,
    input,
    narrativeType,
    primaryPeak?.experience.id,
  );

  const report = evaluateFeasibility(dayPlan, repaired.items, input.dailyEndSlot);
  const preFeasibilityStatus = toFeasibilityStatus(overflowMin);

  const criticalFinalDrop = repaired.finalDroppedItems.some(
    (item) => item.role === "opener" || item.role === "peak" || item.role === "recovery",
  );

  const finalStatus =
    repaired.hadInvalidPlacement && criticalFinalDrop
      ? "partial_fail"
      : repaired.repairs.length > 0
        ? (report.isFeasible ? "repaired" : "partial_fail")
        : (report.isFeasible ? "scheduled" : "partial_fail");

  return {
    schedule: {
      day: dayPlan.day,
      items: repaired.items,
      report,
    },
    diagnostic: {
      dayIndex: dayPlan.day,
      narrativeType,
      primaryPeakId: primaryPeak?.experience.id,
      preFeasibilityStatus,
      estimatedTotalMin,
      availableMin,
      overflowMin,
      flowScoreBeforeRepair: repaired.flowBefore.breakdown.total,
      flowScoreAfterRepair: repaired.flowAfter.breakdown.total,
      repairs: repaired.repairs,
      finalStatus,
      notes: [
        `plannedItems=${flattened.length}`,
        `narrative=${narrativeType}`,
        `peak=${primaryPeak?.experience.id ?? "none"}`,
        `scheduledItems=${repaired.items.length}`,
        `firstStart=${repaired.items[0]?.startSlot ?? "none"}`,
        `invalidPlacement=${repaired.hadInvalidPlacement}`,
        `initialDropped=${repaired.initialDroppedItems.length}`,
        `finalDropped=${repaired.finalDroppedItems.length}`,
        `droppedRoles=${repaired.finalDroppedItems.map((item) => item.role).join(",") || "none"}`,
        `issues=${report.issues.join(",") || "none"}`,
        ...repaired.initialDroppedItems.map(
          (item, idx) =>
            `initialDrop${idx + 1}:${item.role}:${item.experienceId}:${item.reason}:${item.rhythmSlotType ?? "unknown"}`,
        ),
        ...repaired.finalDroppedItems.map(
          (item, idx) =>
            `finalDrop${idx + 1}:${item.role}:${item.experienceId}:${item.reason}:${item.rhythmSlotType ?? "unknown"}`,
        ),
        ...repaired.flowBefore.notes.map((note) => `before:${note}`),
        ...repaired.flowAfter.notes.map((note) => `after:${note}`),
      ],
    },
  };
}
