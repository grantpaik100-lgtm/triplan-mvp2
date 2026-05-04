/**
 * TriPlan V3
 * Current Role:
 * - scoring -> planning -> decision -> scheduling을 orchestration하는 최상위 runtime engine file이다.
 *
 * Target Role:
 * - TriPlan trip engine의 공식 orchestration layer로 유지되어야 한다.
 *
 * Chain:
 * - engine
 *
 * Inputs:
 * - PlanningInput
 * - primary result/user vector
 * - experience dataset
 *
 * Outputs:
 * - final trip result
 * - debug diagnostics
 *
 * Called From:
 * - app/api/generate-trip/route.ts
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
 * - src/engine/*가 아니라 이 파일이 공식 엔진 진입점이다.
 * - 삭제 금지.
 */

import { planDaysWithDiagnostics } from "./planning";
import { applyDecisionLayer } from "./decision";
import { scheduleDayPlan } from "./scheduling";
import type {
  CandidateDiagnostics,
  DaySchedulingDiagnostic,
  ExperienceMetadata,
  PlanningInput,
  SchedulingDiagnostics,
  TripPlanResult,
  UserVector,
} from "./types";

function buildCandidateDiagnostics(
  experiences: ExperienceMetadata[],
): CandidateDiagnostics {
  const byThemeCluster = experiences.reduce(
    (acc, exp) => {
      const cluster = exp.themeCluster ?? "mixed";
      acc[cluster] = (acc[cluster] ?? 0) + 1;
      return acc;
    },
    {} as CandidateDiagnostics["byThemeCluster"],
  );

  const byRole = experiences.reduce(
    (acc, exp) => {
      for (const role of exp.functionalRoleHints ?? []) {
        acc[role] = (acc[role] ?? 0) + 1;
      }
      return acc;
    },
    {} as CandidateDiagnostics["byRole"],
  );

  return {
    totalCandidates: experiences.length,
    selectedCount: 0,
    droppedCount: 0,
    byThemeCluster,
    byRole,
    selected: [],
    dropped: [],
  };
}

function buildSchedulingDiagnostics(
  diagnostics: DaySchedulingDiagnostic[],
): SchedulingDiagnostics {
  const totalOverflowDays = diagnostics.filter((x) => x.overflowMin > 0).length;
  const totalRepairCount = diagnostics.reduce((sum, x) => sum + x.repairs.length, 0);

  return {
    totalOverflowDays,
    totalRepairCount,
    days: diagnostics,
    notes: [
      `days=${diagnostics.length}`,
      `overflowDays=${totalOverflowDays}`,
      `repairCount=${totalRepairCount}`,
    ],
  };
}

export function generateTripPlan(
  user: UserVector,
  input: PlanningInput,
  experiences: ExperienceMetadata[],
): TripPlanResult {
  const candidateDiagnostics = buildCandidateDiagnostics(experiences);

  // [1] Planning
  const {
    dayPlans: rawDayPlans,
    diagnostics: planningDiagnostics,
  } = planDaysWithDiagnostics(user, input, experiences);

  // [2] Decision Layer
  // planning 결과를 받아 scheduling 전에 day-level 결정을 적용한다.
  // - timeBudget 초과 시 optional 트림
  // - suggestedFlow 무결성 정리
  // 절대 하지 않는 것: selection.* 변경, anchor/core 수정, dayPlans 재정렬
  const {
    dayPlans,
    diagnostics: decisionDiagnostics,
  } = applyDecisionLayer(rawDayPlans, input);

  // [3] Scheduling
  const schedules = [];
  const schedulingDayDiagnostics: DaySchedulingDiagnostic[] = [];

  for (let index = 0; index < dayPlans.length; index += 1) {
    const dayPlan = dayPlans[index];

    const scheduledResult = scheduleDayPlan(
      dayPlan,
      input,
      index,
      dayPlans.length,
    );

    schedules.push(scheduledResult.schedule);
    schedulingDayDiagnostics.push(scheduledResult.diagnostic);
  }

  const schedulingDiagnostics = buildSchedulingDiagnostics(schedulingDayDiagnostics);

  return {
    dayPlans,
    schedules,
    debug: {
      candidateDiagnostics,
      planningDiagnostics,
      decisionDiagnostics,
      schedulingDiagnostics,
    },
  };
}
