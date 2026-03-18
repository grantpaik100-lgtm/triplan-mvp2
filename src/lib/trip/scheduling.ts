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

function placeAnchors(
  items: PlannedExperience[],
  dayStartSlot: number,
): ScheduledItem[] {
  const scheduled: ScheduledItem[] = [];

  for (const item of items) {
    if (item.priority !== "anchor") continue;

    const preferredSlot = getPreferredStartSlot(item.experience.preferredTime);
    const startSlot = Math.max(dayStartSlot, preferredSlot);
    const durationSlots = minutesToSlots(item.experience.recommendedDuration);

    scheduled.push({
      experienceId: item.experience.id,
      placeName: item.experience.placeName,
      startSlot,
      endSlot: startSlot + durationSlots,
      durationMinutes: item.experience.recommendedDuration,
      priority: "anchor",
    });
  }

  return scheduled.sort((a, b) => a.startSlot - b.startSlot);
}

function insertSequentially(
  scheduledAnchors: ScheduledItem[],
  items: PlannedExperience[],
  dayStartSlot: number,
): ScheduledItem[] {
  const result = [...scheduledAnchors].sort((a, b) => a.startSlot - b.startSlot);
  const unscheduled = items.filter(
    (item) => !result.some((s) => s.experienceId === item.experience.id),
  );

  if (result.length === 0) {
    let cursor = dayStartSlot;

    for (const item of unscheduled) {
      const durationSlots = minutesToSlots(item.experience.recommendedDuration);

      result.push({
        experienceId: item.experience.id,
        placeName: item.experience.placeName,
        startSlot: cursor,
        endSlot: cursor + durationSlots,
        durationMinutes: item.experience.recommendedDuration,
        priority: item.priority,
      });

      cursor += durationSlots;
    }

    return result;
  }

  let lastPlaced = result[result.length - 1];

  for (const item of unscheduled) {
    const travelMinutes = getAreaDistanceMinutes(
      lastPlaced ? items.find((x) => x.experience.id === lastPlaced.experienceId)?.experience.area ??
          item.experience.area : item.experience.area,
      item.experience.area,
    );

    const travelSlots = minutesToSlots(travelMinutes);
    const durationSlots = minutesToSlots(item.experience.recommendedDuration);
    const startSlot = lastPlaced.endSlot + travelSlots;

    const nextItem: ScheduledItem = {
      experienceId: item.experience.id,
      placeName: item.experience.placeName,
      startSlot,
      endSlot: startSlot + durationSlots,
      durationMinutes: item.experience.recommendedDuration,
      priority: item.priority,
    };

    result.push(nextItem);
    lastPlaced = nextItem;
  }

  return result.sort((a, b) => a.startSlot - b.startSlot);
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
  const anchors = placeAnchors(flattened, dayStartSlot);
  const scheduled = insertSequentially(anchors, flattened, dayStartSlot);
  const report = evaluateFeasibility(dayPlan, scheduled, dayEndSlot);

  return {
    day: dayPlan.day,
    items: scheduled,
    report,
  };
}
