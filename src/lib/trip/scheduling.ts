import { getAreaDistanceMinutes } from "./area";
import { getPreferredStartSlot, isAllowedTimeSlot, minutesToSlots } from "./time";
import type {
  DayPlan,
  DaySchedule,
  FeasibilityReport,
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

  // 끝까지 못 찾으면 일단 earliest 반환하고 feasibility에서 잡는다.
  return earliestSlot;
}

function getAreaOfScheduledItem(
  item: ScheduledItem,
  plannedItems: PlannedExperience[],
) {
  const found = plannedItems.find((x) => x.experience.id === item.experienceId);
  return found?.experience.area ?? "other";
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

    const travelMinutes = prev
      ? getAreaDistanceMinutes(prevArea, currentArea)
      : 0;

    const travelSlots = minutesToSlots(travelMinutes);

    const earliestSlot = prev
      ? prev.endSlot + travelSlots
      : dayStartSlot;

    let startSlot = findNextAllowedStartSlot(planned, earliestSlot);

    // anchor는 preferredTime을 조금 더 존중
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

  const totalMinutes =
    items.length > 0
      ? (items[items.length - 1].endSlot - items[0].startSlot) * 30
      : 0;

  return {
    isFeasible: issues.length === 0,
    issues: Array.from(new Set(issues)),
    totalFatigue,
    totalMinutes,
  };
}

export function scheduleDayPlan(
  dayPlan: DayPlan,
  dayStartSlot: number,
  dayEndSlot: number,
): DaySchedule {
  const flattened = flattenDayPlan(dayPlan);
  const scheduled = buildSequentialSchedule(flattened, dayStartSlot);
  const report = evaluateFeasibility(dayPlan, scheduled, dayEndSlot);

  return {
    day: dayPlan.day,
    items: scheduled,
    report,
  };
}
