import type {
  TripPlanResult,
  DayPlan,
  DaySchedule,
  ScheduledItem,
} from "@/lib/trip/types";

export type TripSummaryViewModel = {
  days: number;
  totalDays: number;
  overflowDays: number;
  totalRepairCount: number;
  explanation: string;
};

export type PlaceRowViewModel = {
  slotLabel: string;
  placeName: string;
  durationMinutes: number;
  priority: string;
  tier?: string;
};

export type DayCardViewModel = {
  day: number;
  areaText: string;
  estimatedMinutes: number;
  items: PlaceRowViewModel[];
};

function formatSlotLabel(startSlot: number) {
  if (startSlot < 11) return "morning";
  if (startSlot < 14) return "midday";
  if (startSlot < 18) return "afternoon";
  return "evening";
}

export function toPlaceRowViewModel(
  item: ScheduledItem
): PlaceRowViewModel {
  return {
    slotLabel: formatSlotLabel(item.startSlot),
    placeName: item.placeName,
    durationMinutes: item.durationMinutes,
    priority: item.priority,
    tier: item.planningTier,
  };
}

export function toDayCardViewModel(
  dayPlan: DayPlan,
  schedule: DaySchedule
): DayCardViewModel {
  return {
    day: dayPlan.day,
    areaText:
      dayPlan.areas.length > 0
        ? dayPlan.areas.join(" · ")
        : "지역 미정",
    estimatedMinutes: schedule.report.totalMinutes,
    items: schedule.items.map(toPlaceRowViewModel),
  };
}

export function toSummaryViewModel(
  result: TripPlanResult
): TripSummaryViewModel {
  return {
    days: result.dayPlans.length,
    totalDays: result.schedules.length,
    overflowDays:
      result.debug.schedulingDiagnostics.totalOverflowDays,
    totalRepairCount:
      result.debug.schedulingDiagnostics.totalRepairCount,
    explanation:
      "사용자 선호, 시간 제약, 경험 다양성을 반영해 일정을 생성했습니다.",
  };
}
