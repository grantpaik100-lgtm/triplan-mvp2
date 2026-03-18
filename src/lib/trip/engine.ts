import { planDays } from "./planning";
import { repairSchedule } from "./repair";
import { scheduleDayPlan } from "./scheduling";
import type {
  ExperienceMetadata,
  PlanningInput,
  TripPlanResult,
  UserVector,
} from "./types";

export function generateTripPlan(
  user: UserVector,
  input: PlanningInput,
  experiences: ExperienceMetadata[],
): TripPlanResult {
  const dayPlans = planDays(user, input, experiences);

  const schedules = dayPlans.map((dayPlan) => {
    const scheduled = scheduleDayPlan(
      dayPlan,
      input.dailyStartSlot,
      input.dailyEndSlot,
    );

    if (!scheduled.report.isFeasible) {
      return repairSchedule(dayPlan, scheduled, input.dailyEndSlot);
    }

    return scheduled;
  });

  return {
    dayPlans,
    schedules,
  };
}
