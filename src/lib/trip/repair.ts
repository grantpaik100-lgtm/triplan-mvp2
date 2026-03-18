import { minutesToSlots } from "./time";
import { evaluateFeasibility } from "./scheduling";
import type { DayPlan, DaySchedule } from "./types";

export function repairSchedule(
  dayPlan: DayPlan,
  schedule: DaySchedule,
  dayEndSlot: number,
): DaySchedule {
  let items = [...schedule.items];

  // 1. time overflow면 optional 먼저 제거
  if (schedule.report.issues.includes("time_overflow")) {
    const optionalIds = new Set(dayPlan.optional.map((x) => x.experience.id));
    items = items.filter((item) => !optionalIds.has(item.experienceId));
  }

  // 2. 그래도 길면 core duration 축소
  if (items.some((item) => item.endSlot > dayEndSlot)) {
    items = items.map((item) => {
      if (item.priority === "core") {
        const reducedMinutes = Math.max(45, item.durationMinutes - 30);
        const reducedSlots = minutesToSlots(reducedMinutes);

        return {
          ...item,
          durationMinutes: reducedMinutes,
          endSlot: item.startSlot + reducedSlots,
        };
      }
      return item;
    });
  }

  const report = evaluateFeasibility(dayPlan, items, dayEndSlot);

  return {
    ...schedule,
    items,
    report,
  };
}
