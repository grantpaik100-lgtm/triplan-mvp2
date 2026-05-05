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
import {
  buildDecisionReadyDayPlan,
  convertDecisionSelectionToDayPlan,
} from "./decision";

import { scheduleDayPlan } from "./scheduling";
import { generateSchedulingPreview } from "./schedulingPreview";
import type {
  CandidateDiagnostics,
  DaySchedulingDiagnostic,
  DecisionDiagnostics,
  DecisionSelectedOptions,
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

  // [2] Decision Ready Plan 생성
  // Planning 결과를 role 기반 선택지 구조로 변환한다.
  // 실제 UI 선택은 아직 없으므로 MVP에서는 각 role별 1순위 option을 자동 선택한다.
  const decisionPlans = rawDayPlans.map((dayPlan) =>
    buildDecisionReadyDayPlan(dayPlan, input, user),
  );

  // [3] Auto Choice Fallback
  // MVP 조건:
  // - peak/recovery/support 각 role의 1순위 option 자동 선택
  // - 선택 로그는 debug.selectedOptions에 남긴다
  const selectedOptionLogs: {
    dayIndex: number;
    selectedOptions: DecisionSelectedOptions;
  }[] = [];

   const dayPlans = rawDayPlans.map((rawDayPlan, index) => {
    const decisionPlan = decisionPlans[index];

    const targetItemCount =
      rawDayPlan.selection?.targetItemCount ??
      rawDayPlan.suggestedFlow?.length ??
      rawDayPlan.roughOrder.length ??
      3;

    const mandatorySelectionCount =
      (decisionPlan.options.peak[0] ? 1 : 0) +
      (decisionPlan.options.recovery[0] ? 1 : 0);

    const baseSupportSelectionCount = Math.max(
      0,
      targetItemCount - mandatorySelectionCount,
    );

    // V4 Decision Feedback MVP:
    // Scheduling Preview에서 flat이 반복되는 원인은 peak/recovery만 선택되는 2-node flow다.
    // Scheduling이 선택을 수정하는 것이 아니라, Decision fallback 단계에서 support를 최소 1개 보강한다.
    // 단, 사용자가 직접 선택한 UI가 없는 MVP fallback에서만 적용되는 임시 정책이다.
    const minimumSupportForQuality =
      decisionPlan.options.support.length > 0 ? 1 : 0;

    const supportSelectionCount = Math.min(
      decisionPlan.options.support.length,
      Math.max(baseSupportSelectionCount, minimumSupportForQuality),
    );

    const selectedOptions: DecisionSelectedOptions = {
      peak: decisionPlan.options.peak[0],
      recovery: decisionPlan.options.recovery[0],
      support: decisionPlan.options.support.slice(0, supportSelectionCount),
    };

    selectedOptionLogs.push({
      dayIndex: decisionPlan.dayIndex,
      selectedOptions,
    });

    return convertDecisionSelectionToDayPlan({
      sourceDayPlan: rawDayPlan,
      selectedOptions,
      structureType: decisionPlan.structureType,
    });
  });
  // [4] Decision Diagnostics
  // 기존 planning/scheduling diagnostics와 별도로 decision layer 상태를 남긴다.
  const decisionDiagnostics: DecisionDiagnostics = {
    days: decisionPlans.map((decisionPlan) => ({
      dayIndex: decisionPlan.dayIndex,
      actionsTaken: ["no_op"],
      trimmedOptionalIds: [],
      suggestedFlowRebuilt: false,
      budgetBeforeMin:
        rawDayPlans[decisionPlan.dayIndex - 1]?.timeBudget?.estimatedTotalMin ??
        0,
      budgetAfterMin:
        dayPlans[decisionPlan.dayIndex - 1]?.timeBudget?.estimatedTotalMin ?? 0,
      notes: [
        "decision_layer:decision_ready_plan_created",
        "decision_layer:auto_choice_fallback_used",
        `structure=${decisionPlan.structureType}`,
        `peakOptions=${decisionPlan.options.peak.length}`,
        `recoveryOptions=${decisionPlan.options.recovery.length}`,
        `supportOptions=${decisionPlan.options.support.length}`,
      ],
    })),
    totalTrimsApplied: 0,
    notes: [
      "Decision Layer MVP active",
      "DecisionReadyDayPlan generated",
      "Auto choice fallback selected first option per role",
      "Selected options converted back to DayPlan before scheduling",
      "Planning diagnostics preserved",
      "Scheduling diagnostics preserved",
    ],
  };
  // [5] Scheduling Preview
  // V4:
  // Scheduling은 사용자 선택을 바로 수정하지 않는다.
  // 먼저 선택 결과의 시간/피로/충돌/trade-off를 preview로 분석한다.
  const availableMinutes = Math.max(
    0,
    (input.dailyEndSlot - input.dailyStartSlot) * 30,
  );

  const schedulingPreview = generateSchedulingPreview({
    days: selectedOptionLogs.map((log, index) => ({
      dayIndex: log.dayIndex,
      structureType: decisionPlans[index]?.structureType ?? "balanced",
      selectedOptions: log.selectedOptions,
      availableMinutes,
    })),
    experiences,
  });
  // [6] Scheduling
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

  const schedulingDiagnostics = buildSchedulingDiagnostics(
    schedulingDayDiagnostics,
  );

  return {
    dayPlans,
    schedules,
    debug: {
  candidateDiagnostics,
  planningDiagnostics,
  decisionDiagnostics,
  decisionPlans,
  selectedOptions: selectedOptionLogs,
  schedulingPreview,
  schedulingDiagnostics,
},
  };
}
