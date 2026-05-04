/**
 * TriPlan V3
 * Current Role:
 * - planning 결과(DayPlan[])를 받아 scheduling 전에 day-level 결정을 적용하는 Decision Layer다.
 *
 * Target Role:
 * - Planning → Scheduling 사이의 공식 decision boundary로 유지되어야 한다.
 * - planning의 PlanningContract(timeBudget / pins / suggestedFlow)를 소비해
 *   scheduling이 받는 DayPlan을 실행 가능한 상태로 만든다.
 *
 * Chain:
 * - engine
 *
 * Inputs:
 * - DayPlan[] (planDaysWithDiagnostics 출력)
 * - PlanningInput
 *
 * Outputs:
 * - 결정이 적용된 DayPlan[]
 * - DecisionDiagnostics
 *
 * Called From:
 * - src/lib/trip/engine.ts (generateTripPlan 내부)
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
 * V1 범위:
 * - Budget guard: timeBudget.overEstimatedMin > 0이면 optional을 낮은 planningScore부터 트림
 * - suggestedFlow 무결성: 트림 이후 suggestedFlow에서 제거된 ID 정리
 * - Pass-through: 건드릴 게 없으면 원본 그대로 반환
 *
 * 절대 하지 않는 것:
 * - selection.peakCandidateId / selection.recoveryCandidateId 변경 (scheduling이 직접 읽음)
 * - anchor / core 수정
 * - DayPlan 배열 재정렬 또는 수 변경
 * - peak / recovery 재선정
 */

import type {
  DayDecisionLog,
  DayPlan,
  DecisionActionType,
  DecisionDiagnostics,
  PlannedExperience,
  PlanningInput,
} from "./types";

// =============================================================================
// Internal helpers
// =============================================================================

function getOverflowMinutes(dayPlan: DayPlan): number {
  return dayPlan.timeBudget?.overEstimatedMin ?? 0;
}

function getEstimatedTotalMinutes(dayPlan: DayPlan): number {
  return dayPlan.timeBudget?.estimatedTotalMin ?? 0;
}

/**
 * peak / recovery 후보는 optional 배열 안에 있더라도 절대 트림하지 않는다.
 * scheduling이 selection.peakCandidateId / recoveryCandidateId로 이 items를 직접 식별하기 때문이다.
 */
function isStructurallyProtected(
  item: PlannedExperience,
  peakId: string | undefined,
  recoveryId: string | undefined,
): boolean {
  const id = item.experience.id;
  return id === peakId || id === recoveryId;
}

// =============================================================================
// Budget guard
// =============================================================================

type BudgetGuardResult = {
  finalOptionals: PlannedExperience[];
  trimmedIds: string[];
  estimatedSavedMin: number;
};

/**
 * timeBudget.overEstimatedMin > 0이면 optional에서 낮은 planningScore 순으로 트림한다.
 *
 * 절약 추정:
 * - 트림된 item의 recommendedDuration 합산을 절약 분으로 사용한다.
 * - 실제 절약은 duration + 이동 시간 감소이므로 이 추정은 보수적이다(실제 더 여유로워짐).
 * - V1에서는 이 근사치로 충분하다.
 */
function applyBudgetGuard(dayPlan: DayPlan): BudgetGuardResult {
  const overflowMin = getOverflowMinutes(dayPlan);

  if (overflowMin <= 0 || dayPlan.optional.length === 0) {
    return {
      finalOptionals: dayPlan.optional,
      trimmedIds: [],
      estimatedSavedMin: 0,
    };
  }

  const peakId = dayPlan.selection?.peakCandidateId;
  const recoveryId = dayPlan.selection?.recoveryCandidateId;

  // 낮은 planningScore 순으로 정렬 — 가장 약한 optional부터 트림
  const sorted = [...dayPlan.optional].sort(
    (a, b) => a.planningScore - b.planningScore,
  );

  const trimmedIds: string[] = [];
  let remainingOverflow = overflowMin;

  for (const item of sorted) {
    if (remainingOverflow <= 0) break;

    if (isStructurallyProtected(item, peakId, recoveryId)) {
      continue;
    }

    trimmedIds.push(item.experience.id);
    remainingOverflow -= item.experience.recommendedDuration;
  }

  const trimmedSet = new Set(trimmedIds);

  // 원래 optional 배열 순서 유지 (sorted 순서 아님)
  const finalOptionals = dayPlan.optional.filter(
    (item) => !trimmedSet.has(item.experience.id),
  );

  const estimatedSavedMin = trimmedIds.reduce((sum, id) => {
    const item = dayPlan.optional.find((x) => x.experience.id === id);
    return sum + (item?.experience.recommendedDuration ?? 0);
  }, 0);

  return { finalOptionals, trimmedIds, estimatedSavedMin };
}

// =============================================================================
// suggestedFlow integrity
// =============================================================================

/**
 * 트림 후 suggestedFlow에 남아있는 제거된 ID를 정리한다.
 * 순서는 보존한다 — 기존 backbone(opener → peak → recovery)이 유지된다.
 * IDs가 없어진 결과로 배열이 비면 undefined를 반환해 scheduling fallback chain이 동작하게 한다.
 */
function sanitizeSuggestedFlow(
  suggestedFlow: string[] | undefined,
  finalItemIds: Set<string>,
): string[] | undefined {
  if (!suggestedFlow) return undefined;

  const sanitized = suggestedFlow.filter((id) => finalItemIds.has(id));
  return sanitized.length > 0 ? sanitized : undefined;
}

function buildFinalItemIds(
  dayPlan: DayPlan,
  finalOptionals: PlannedExperience[],
): Set<string> {
  const ids = new Set<string>();
  for (const item of dayPlan.anchor) ids.add(item.experience.id);
  for (const item of dayPlan.core) ids.add(item.experience.id);
  for (const item of finalOptionals) ids.add(item.experience.id);
  return ids;
}

// =============================================================================
// Per-day decision application
// =============================================================================

function applyDecisionToDay(
  dayPlan: DayPlan,
): { dayPlan: DayPlan; log: DayDecisionLog } {
  const budgetBeforeMin = getEstimatedTotalMinutes(dayPlan);
  const overflowMin = getOverflowMinutes(dayPlan);

  // --- Step 1: Budget guard ---
  const {
    finalOptionals,
    trimmedIds,
    estimatedSavedMin,
  } = applyBudgetGuard(dayPlan);

  const didTrim = trimmedIds.length > 0;

  // --- Step 2: suggestedFlow integrity ---
  const finalItemIds = buildFinalItemIds(dayPlan, finalOptionals);
  const sanitizedFlow = sanitizeSuggestedFlow(dayPlan.suggestedFlow, finalItemIds);

  // flow rebuild이 필요한 조건: 트림이 발생했고 기존 suggestedFlow가 있었을 때
  const didRebuildFlow =
    didTrim && dayPlan.suggestedFlow !== undefined;

  // --- Actions 집계 ---
  const actions: DecisionActionType[] = [];
  if (didTrim) actions.push("trim_overflow_optional");
  if (didRebuildFlow) actions.push("rebuild_suggested_flow");
  if (actions.length === 0) actions.push("no_op");

  const budgetAfterMin = Math.max(0, budgetBeforeMin - estimatedSavedMin);

  const notes: string[] = [
    `day=${dayPlan.day}`,
    `overflowBefore=${overflowMin}`,
    `trimCount=${trimmedIds.length}`,
    `budgetBefore=${budgetBeforeMin}`,
    `budgetAfter=${budgetAfterMin}`,
    ...(trimmedIds.length > 0
      ? [`trimmedIds=${trimmedIds.join(",")}`]
      : []),
  ];

  const updatedDayPlan: DayPlan = {
    ...dayPlan,
    optional: finalOptionals,
    suggestedFlow: didRebuildFlow ? sanitizedFlow : dayPlan.suggestedFlow,
  };

  const log: DayDecisionLog = {
    dayIndex: dayPlan.day,
    actionsTaken: actions,
    trimmedOptionalIds: trimmedIds,
    suggestedFlowRebuilt: didRebuildFlow,
    budgetBeforeMin,
    budgetAfterMin,
    notes,
  };

  return { dayPlan: updatedDayPlan, log };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Planning 결과에 Decision Layer를 적용한다.
 *
 * - 입력 DayPlan[] 배열의 순서와 길이를 변경하지 않는다.
 * - 각 DayPlan의 selection.* 메타데이터를 변경하지 않는다.
 * - anchor / core는 건드리지 않는다.
 * - optional 트림 및 suggestedFlow 정리만 수행한다.
 */
export function applyDecisionLayer(
  dayPlans: DayPlan[],
  _input: PlanningInput,
): { dayPlans: DayPlan[]; diagnostics: DecisionDiagnostics } {
  const resultDayPlans: DayPlan[] = [];
  const dayLogs: DayDecisionLog[] = [];

  for (const dayPlan of dayPlans) {
    const { dayPlan: decided, log } = applyDecisionToDay(dayPlan);
    resultDayPlans.push(decided);
    dayLogs.push(log);
  }

  const totalTrimsApplied = dayLogs.reduce(
    (sum, log) => sum + log.trimmedOptionalIds.length,
    0,
  );

  const diagnostics: DecisionDiagnostics = {
    days: dayLogs,
    totalTrimsApplied,
    notes: [
      `days=${dayPlans.length}`,
      `totalTrims=${totalTrimsApplied}`,
    ],
  };

  return { dayPlans: resultDayPlans, diagnostics };
}
