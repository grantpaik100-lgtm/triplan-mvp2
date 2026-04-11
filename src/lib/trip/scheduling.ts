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

type NarrativeSlotTemplate = {
  order: RhythmSlotType[];
};

type FlowEvaluation = {
  breakdown: FlowScoreBreakdown;
  notes: string[];
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
    return {
      order: narrativeType === "recovery"
        ? ["warm_up", "cool_down"]
        : ["warm_up", "emotional_peak"],
    };
  }

  if (narrativeType === "immersion") {
    return {
      order: ["warm_up", "activation", "emotional_peak", "cool_down"],
    };
  }

  if (narrativeType === "recovery") {
    return {
      order: ["warm_up", "activation", "recovery", "cool_down"],
    };
  }

  return {
    order: ["warm_up", "activation", "emotional_peak", "recovery", "cool_down"],
  };
}

function scorePeakCandidate(item: PlannedExperience): number {
  let score = item.planningScore;

  if (item.priority === "anchor") score += 100;
  if (item.selectionReason?.tags.includes("must_place")) score += 15;
  if (item.selectionReason?.tags.includes("must_experience")) score += 15;
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
  return (
    item.functionalRole === "rest" ||
    item.functionalRole === "transition_safe" ||
    item.experience.placeType.toLowerCase().includes("cafe") ||
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

  const slotted = items.map((item) => ({
    planned: item,
    slot: classifyRhythmSlot(item, narrativeType, primaryPeakId),
  }));

  const slotOrder = new Map(template.order.map((slot, idx) => [slot, idx]));

  slotted.sort((a, b) => {
    const slotDiff = (slotOrder.get(a.slot) ?? 999) - (slotOrder.get(b.slot) ?? 999);
    if (slotDiff !== 0) return slotDiff;

    if (a.planned.experience.id === primaryPeakId) return -1;
    if (b.planned.experience.id === primaryPeakId) return 1;

    return b.planned.planningScore - a.planned.planningScore;
  });

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

function findNextAllowedStartSlot(
  planned: PlannedExperience,
  earliestSlot: number,
): number {
  for (let slot = earliestSlot; slot <= 47; slot += 1) {
    if (isAllowedTimeSlot(planned.experience.allowedTimes, slot)) {
      return slot;
    }
  }

  return earliestSlot;
}

function realizeTimeline(
  slotted: ScheduledItem[],
  plannedMap: Map<string, PlannedExperience>,
  dayStartSlot: number,
): ScheduledItem[] {
  const realized: ScheduledItem[] = [];

  for (const item of slotted) {
    const planned = plannedMap.get(item.experienceId);
    if (!planned) continue;

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

    let startSlot = findNextAllowedStartSlot(planned, earliestSlot);

    if (item.isPrimaryPeak) {
      const preferredSlot = getPreferredStartSlot(planned.experience.preferredTime);
      if (preferredSlot > startSlot) {
        startSlot = findNextAllowedStartSlot(planned, preferredSlot);
      }
    }

    const durationSlots = minutesToSlots(item.durationMinutes);

    realized.push({
      ...item,
      startSlot,
      endSlot: startSlot + durationSlots,
    });
  }

  return realized;
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

function repairScheduleFlow(
  dayPlan: DayPlan,
  items: ScheduledItem[],
  input: PlanningInput,
  dayEndSlot: number,
  primaryPeakId?: string,
): {
  items: ScheduledItem[];
  repairs: RepairActionLog[];
  flowBefore: FlowEvaluation;
  flowAfter: FlowEvaluation;
} {
  const plannedMap = new Map(
    [...dayPlan.anchor, ...dayPlan.core, ...dayPlan.optional].map((item) => [
      item.experience.id,
      item,
    ]),
  );

  const flowBefore = evaluateFlowQuality(dayPlan, items, input, primaryPeakId);
  let working = [...items];
  const repairs: RepairActionLog[] = [];
  let step = 1;

  let overflowBefore = getOverflowMin(working, dayEndSlot);

  if (overflowBefore > 0) {
    const removed = removeOptionalItems(dayPlan, working);
    if (removed.removedIds.length > 0) {
      working = removed.items;
      const overflowAfter = getOverflowMin(working, dayEndSlot);

      repairs.push({
        step: step++,
        action: "remove_optional",
        reason: "Remove optional items first to protect anchor/core flow",
        beforeOverflowMin: overflowBefore,
        afterOverflowMin: overflowAfter,
      });

      overflowBefore = overflowAfter;
    }
  }

  if (hasConsecutiveHighFatigue(working, plannedMap)) {
    const moved = moveRecoveryEarlier(working);
    if (moved.movedId) {
      working = moved.items;

      repairs.push({
        step: step++,
        action: "insert_recovery",
        targetExperienceId: moved.movedId,
        reason: "Move recovery item earlier after fatigue burst",
        beforeOverflowMin: overflowBefore,
        afterOverflowMin: getOverflowMin(working, dayEndSlot),
      });
    }
  }

  const peakIndex = working.findIndex((item) => item.experienceId === primaryPeakId);
  if (peakIndex >= 3) {
    const moved = movePeakEarlier(working);
    if (moved.movedId) {
      working = moved.items;

      repairs.push({
        step: step++,
        action: "move_peak_earlier",
        targetExperienceId: moved.movedId,
        reason: "Protect primary peak from late burial",
        beforeOverflowMin: overflowBefore,
        afterOverflowMin: getOverflowMin(working, dayEndSlot),
      });
    }
  }

  const retimed = realizeTimeline(working, plannedMap, input.dailyStartSlot);
  const flowAfter = evaluateFlowQuality(dayPlan, retimed, input, primaryPeakId);

  return {
    items: retimed,
    repairs,
    flowBefore,
    flowAfter,
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
  const plannedMap = new Map(flattened.map((item) => [item.experience.id, item]));

  const slotted = assignToRhythmSlots(
    flattened,
    narrativeType,
    primaryPeak?.experience.id,
  );

  const timed = realizeTimeline(slotted, plannedMap, input.dailyStartSlot);

  const repaired = repairScheduleFlow(
    dayPlan,
    timed,
    input,
    input.dailyEndSlot,
    primaryPeak?.experience.id,
  );

  const report = evaluateFeasibility(dayPlan, repaired.items, input.dailyEndSlot);
  const preFeasibilityStatus = toFeasibilityStatus(overflowMin);

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
      finalStatus: repaired.repairs.length > 0
        ? (report.isFeasible ? "repaired" : "partial_fail")
        : (report.isFeasible ? "scheduled" : "partial_fail"),
      notes: [
        `plannedItems=${flattened.length}`,
        `narrative=${narrativeType}`,
        `peak=${primaryPeak?.experience.id ?? "none"}`,
        `scheduledItems=${repaired.items.length}`,
        `issues=${report.issues.join(",") || "none"}`,
        ...repaired.flowBefore.notes.map((note) => `before:${note}`),
        ...repaired.flowAfter.notes.map((note) => `after:${note}`),
      ],
    },
  };
}
