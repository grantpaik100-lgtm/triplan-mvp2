/**
 * TriPlan V3
 * Current Role:
 * - raw trip result를 result page rendering용 view model로 변환하는 adapter file이다.
 *
 * Target Role:
 * - engine output -> UI rendering model 변환의 공식 adapter layer로 유지되어야 한다.
 *
 * Chain:
 * - result
 *
 * Inputs:
 * - trip engine raw result
 *
 * Outputs:
 * - summary/day/place rendering model
 *
 * Called From:
 * - app/trip/result/page.tsx
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
 * - engine schema와 UI schema를 직접 결합하지 않게 해주는 완충 계층이다.
 */
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
