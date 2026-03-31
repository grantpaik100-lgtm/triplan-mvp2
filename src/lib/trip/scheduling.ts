import { getAreaDistanceMinutes } from "./area";
import { getPreferredStartSlot, isAllowedTimeSlot, minutesToSlots } from "./time";
import type {
  Area,
  DayPlan,
  DaySchedule,
  DaySchedulingDiagnostic,
  FeasibilityReport,
  FeasibilityStatus,
  PlannedExperience,
  ScheduleIssue,
  ScheduledItem,
} from "./types";

function flattenDayPlan(dayPlan: DayPlan): PlannedExperience[] {
  const orderMap = new Map(dayPlan.roughOrder.map((id, idx) => [id, idx]));

  return [...dayPlan.anchor, ...dayPlan.core, ...dayPlan.optional].sort((a, b) => {
    return (orderMap.get(a.experience.id) ?? 999) - (orderMap.get(b.experience.id) ?? 999);
  });
}

function getAreaOfPlannedItem(item: PlannedExperience): Area {
  return item.experience.area;
}

function getAreaOfScheduledItem(
  item: ScheduledItem,
  plannedItems: PlannedExperience[],
): string {
  const found = plannedItems.find((x) => x.experience.id === item.experienceId);
  return found?.experience.area ?? "other";
}

function estimateTravelMinutes(items: PlannedExperience[]): number {
  if (items.length <= 1) return 0;

  let total = 0;

  for (let i = 1; i < items.length; i += 1) {
    const prevArea = getAreaOfPlannedItem(items[i - 1]);
    const nextArea = getAreaOfPlannedItem(items[i]);
    total += getAreaDistanceMinutes(prevArea, nextArea);
  }

  return total;
}

function estimatePlannedMinutes(items: PlannedExperience[]): number {
  const experienceMinutes = items.reduce(
    (sum, item) => sum + item.experience.recommendedDuration,
    0,
  );
  const travelMinutes = estimateTravelMinutes(items);

  return experienceMinutes + travelMinutes;
}

function toFeasibilityStatus(overflowMin: number): FeasibilityStatus {
  if (overflowMin <= 0) return "safe";
  if (overflowMin <= 60) return "tight";
  return "overflow";
}

export function evaluatePreFeasibility(
  dayPlan: DayPlan,
  dayStartSlot: number,
  dayEndSlot: number,
): DaySchedulingDiagnostic {
  const flattened = flattenDayPlan(dayPlan);
  const availableMin = (dayEndSlot - dayStartSlot) * 30;
  const estimatedTotalMin = estimatePlannedMinutes(flattened);
  const overflowMin = Math.max(0, estimatedTotalMin - availableMin);

  return {
    dayIndex: dayPlan.day,
    preFeasibilityStatus: toFeasibilityStatus(overflowMin),
    estimatedTotalMin,
    availableMin,
    overflowMin,
    repairs: [],
    finalStatus: "scheduled",
    notes: [
      `plannedItems=${flattened.length}`,
      `anchors=${dayPlan.anchor.length}`,
      `core=${dayPlan.core.length}`,
      `optional=${dayPlan.optional.length}`,
    ],
  };
}

/**
 * allowedTimes 안에 들어가면서
 * earliestSlot 이상인 가장 빠른 slot을 찾는다.
 */
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

function buildSequentialSchedule(
  items: PlannedExperience[],
  dayStartSlot: number,
): ScheduledItem[] {
  const result: ScheduledItem[] = [];

  for (const planned of items) {
    const prev = result[result.length - 1];

    const prevArea = prev ? getAreaOfScheduledItem(prev, items) : planned.experience.area;
    const currentArea = planned.experience.area;

    const travelMinutes = prev ? getAreaDistanceMinutes(prevArea, currentArea) : 0;
    const travelSlots = minutesToSlots(travelMinutes);

    const earliestSlot = prev ? prev.endSlot + travelSlots : dayStartSlot;

    let startSlot = findNextAllowedStartSlot(planned, earliestSlot);

    if (planned.priority === "anchor") {
      const preferredSlot = getPreferredStartSlot(planned.experience.preferredTime);
      if (preferredSlot > startSlot) {
        startSlot = findNextAllowedStartSlot(planned, preferredSlot);
      }
    }

    const durationSlots = minutesToSlots(planned.experience.recommendedDuration);

    result.push({
      experienceId: planned.experience.id,
      placeName: planned.experience.placeName,
      startSlot,
      endSlot: startSlot + durationSlots,
      durationMinutes: planned.experience.recommendedDuration,
      priority: planned.priority,
      planningTier: planned.planningTier,
      functionalRole: planned.functionalRole,
      themeCluster: planned.themeCluster,
    });
  }

  return result;
}

export function evaluateFeasibility(
  dayPlan: DayPlan,
  items: ScheduledItem[],
  dayEndSlot: number,
): FeasibilityReport {
  const issues: ScheduleIssue[] = [];
  const expMap = new Map(
    [...dayPlan.anchor, ...dayPlan.core, ...dayPlan.optional].map((x) => [x.experience.id, x]),
  );

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
    const prev = items[i - 1];
    const current = items[i];
    const prevArea = getAreaOfScheduledItem(prev, [...dayPlan.anchor, ...dayPlan.core, ...dayPlan.optional]);
    const currentArea = getAreaOfScheduledItem(current, [...dayPlan.anchor, ...dayPlan.core, ...dayPlan.optional]);
    const distance = getAreaDistanceMinutes(prevArea, currentArea);

    if (distance > 60) {
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

export function scheduleDayPlan(
  dayPlan: DayPlan,
  dayStartSlot: number,
  dayEndSlot: number,
): { schedule: DaySchedule; diagnostic: DaySchedulingDiagnostic } {
  const pre = evaluatePreFeasibility(dayPlan, dayStartSlot, dayEndSlot);
  const flattened = flattenDayPlan(dayPlan);
  const scheduled = buildSequentialSchedule(flattened, dayStartSlot);
  const report = evaluateFeasibility(dayPlan, scheduled, dayEndSlot);

  return {
    schedule: {
      day: dayPlan.day,
      items: scheduled,
      report,
    },
    diagnostic: {
      ...pre,
      finalStatus: report.isFeasible ? "scheduled" : "partial_fail",
      notes: [
        ...pre.notes,
        `scheduledItems=${scheduled.length}`,
        `issues=${report.issues.join(",") || "none"}`,
      ],
    },
  };
}
