import { evaluateFeasibility } from "./scheduling";
import type {
  DayPlan,
  DaySchedule,
  DaySchedulingDiagnostic,
  RepairActionLog,
  ScheduledItem,
} from "./types";

function getOverflowMin(items: ScheduledItem[], dayEndSlot: number): number {
  if (items.length === 0) return 0;
  const lastEndSlot = items[items.length - 1].endSlot;
  return Math.max(0, (lastEndSlot - dayEndSlot) * 30);
}

function removeOptionalItems(
  dayPlan: DayPlan,
  items: ScheduledItem[],
): { items: ScheduledItem[]; removedIds: string[] } {
  const optionalIds = new Set(dayPlan.optional.map((x) => x.experience.id));
  const kept = items.filter((item) => !optionalIds.has(item.experienceId));
  const removed = items
    .filter((item) => optionalIds.has(item.experienceId))
    .map((item) => item.experienceId);

  return {
    items: kept,
    removedIds: removed,
  };
}

function shrinkRoleItems(
  items: ScheduledItem[],
  role: ScheduledItem["functionalRole"],
  shrinkByMin: number,
  minDurationMin: number,
): ScheduledItem[] {
  return items.map((item) => {
    if (item.functionalRole !== role) return item;

    const nextDuration = Math.max(minDurationMin, item.durationMinutes - shrinkByMin);
    const diff = item.durationMinutes - nextDuration;

    if (diff <= 0) return item;

    return {
      ...item,
      durationMinutes: nextDuration,
      endSlot: item.endSlot - Math.floor(diff / 30),
    };
  });
}

function removeLowestPriorityCore(
  items: ScheduledItem[],
): { items: ScheduledItem[]; removedId?: string } {
  const target = [...items]
    .reverse()
    .find((item) => item.priority === "core" && item.functionalRole === "core");

  if (!target) {
    return { items };
  }

  return {
    items: items.filter((item) => item.experienceId !== target.experienceId),
    removedId: target.experienceId,
  };
}

export function repairSchedule(
  dayPlan: DayPlan,
  schedule: DaySchedule,
  dayEndSlot: number,
  baseDiagnostic: DaySchedulingDiagnostic,
): { schedule: DaySchedule; diagnostic: DaySchedulingDiagnostic } {
  let items = [...schedule.items];
  const repairs: RepairActionLog[] = [];
  let step = 1;

  let overflowBefore = getOverflowMin(items, dayEndSlot);

  if (overflowBefore > 0) {
    const result = removeOptionalItems(dayPlan, items);
    const overflowAfter = getOverflowMin(result.items, dayEndSlot);

    if (result.removedIds.length > 0) {
      repairs.push({
        step: step++,
        action: "remove_optional",
        reason: "Remove optional buffer first",
        beforeOverflowMin: overflowBefore,
        afterOverflowMin: overflowAfter,
      });
      items = result.items;
      overflowBefore = overflowAfter;
    }
  }

  if (overflowBefore > 0) {
    const nextItems = shrinkRoleItems(items, "rest", 30, 45);
    const overflowAfter = getOverflowMin(nextItems, dayEndSlot);

    if (overflowAfter < overflowBefore) {
      repairs.push({
        step: step++,
        action: "shrink_rest",
        reason: "Shrink rest-like items before removing core",
        beforeOverflowMin: overflowBefore,
        afterOverflowMin: overflowAfter,
      });
      items = nextItems;
      overflowBefore = overflowAfter;
    }
  }

  if (overflowBefore > 0) {
    const nextItems = shrinkRoleItems(items, "meal", 30, 45);
    const overflowAfter = getOverflowMin(nextItems, dayEndSlot);

    if (overflowAfter < overflowBefore) {
      repairs.push({
        step: step++,
        action: "replace_meal",
        reason: "Shrink meal items before removing core",
        beforeOverflowMin: overflowBefore,
        afterOverflowMin: overflowAfter,
      });
      items = nextItems;
      overflowBefore = overflowAfter;
    }
  }

  if (overflowBefore > 0) {
    const result = removeLowestPriorityCore(items);
    const overflowAfter = getOverflowMin(result.items, dayEndSlot);

    if (result.removedId) {
      repairs.push({
        step: step++,
        action: "remove_core",
        targetExperienceId: result.removedId,
        reason: "Remove core item as last resort",
        beforeOverflowMin: overflowBefore,
        afterOverflowMin: overflowAfter,
      });
      items = result.items;
      overflowBefore = overflowAfter;
    }
  }

  const report = evaluateFeasibility(dayPlan, items, dayEndSlot);

  return {
    schedule: {
      ...schedule,
      items,
      report,
    },
    diagnostic: {
      ...baseDiagnostic,
      repairs,
      finalStatus: repairs.length > 0
        ? (report.isFeasible ? "repaired" : "partial_fail")
        : (report.isFeasible ? "scheduled" : "partial_fail"),
      notes: [
        ...baseDiagnostic.notes,
        `repairCount=${repairs.length}`,
        `finalIssues=${report.issues.join(",") || "none"}`,
      ],
    },
  };
}
