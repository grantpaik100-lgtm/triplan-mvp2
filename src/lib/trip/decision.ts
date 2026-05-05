/**
 * TriPlan V3
 * Current Role:
 * - Planning 결과(DayPlan)를 Decision Layer 계약으로 변환한다.
 *
 * Target Role:
 * - Planning과 Scheduling 사이에서 role 기반 선택지를 생성하는 공식 Decision Layer.
 *
 * Chain:
 * - engine | planning -> decision -> scheduling
 *
 * Inputs:
 * - DayPlan
 * - PlanningInput
 *
 * Outputs:
 * - DecisionReadyDayPlan
 *
 * Called From:
 * - engine layer 또는 UI decision flow
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
 * - scheduling.ts 수정 금지.
 * - 파일 내부 타입 재정의 금지.
 * - 타입은 types.ts에서만 import한다.
 * - 상수는 constants.ts에서만 import한다.
 */

import {
  DAY_STRUCTURE_TEMPLATES,
  DECISION_OPTION_COUNT_PER_ROLE,
  DECISION_SCORE_WEIGHTS,
} from "./constants";

import type {
  ConvertDecisionSelectionParams,
  DecisionDayStructureType,
  DecisionDiagnostics,
  DecisionFlowRole,
  DecisionOption,
  DecisionReadyDayPlan,
  DayPlan,
  PlannedExperience,
  PlanningInput,
  UserVector,
} from "./types";

const USER_VECTOR_KEYS: readonly (keyof UserVector)[] = [
  "food",
  "culture",
  "nature",
  "shopping",
  "entertainment",
  "quiet",
  "romantic",
  "local",
  "touristy",
  "luxury",
  "hipster",
  "traditional",
  "walkIntensity",
  "crowdLevel",
  "activityIntensity",
  "cost",
] as const;

export function buildDecisionReadyDayPlan(
  dayPlan: DayPlan,
  input: PlanningInput,
  userVector: UserVector,
): DecisionReadyDayPlan {
  const structureType = resolveDecisionDayStructureType(dayPlan);

  const allItems = [
    ...dayPlan.anchor,
    ...dayPlan.core,
    ...dayPlan.optional,
    ...(dayPlan.lateFallbackReserve ?? []),
  ];

  const uniqueItems = dedupePlannedExperiences(allItems);
  const feasibilityFilteredCount = uniqueItems.filter(
    (item) => !isDecisionFeasible(item, dayPlan, input),
  ).length;

  let optionsByRole = {
  peak: buildOptionsForRole(uniqueItems, "peak", dayPlan, input, userVector),
  recovery: buildOptionsForRole(uniqueItems, "recovery", dayPlan, input, userVector),
  support: buildOptionsForRole(uniqueItems, "support", dayPlan, input, userVector),
};

// 🔥 fallback: support 후보가 없으면 강제로 생성
if (optionsByRole.support.length === 0) {
  const fallbackSupport = uniqueItems.filter((item) => {
    const role = classifyDecisionRole(item, dayPlan);
    return role !== "peak" && role !== "recovery";
  });

  optionsByRole.support = fallbackSupport.slice(0, 3).map((item, index) => {
    const scoreBreakdown = calculateDecisionScore({
      item,
      role: "support",
      dayPlan,
      input,
      userVector,
    });

    return {
      id: `${dayPlan.day}-support-fallback-${item.experience.id}-${index}`,
      experienceId: item.experience.id,
      role: "support",
      title: item.experience.baseExperienceLabel || item.experience.placeName,
      scoreBreakdown,
      explanation: buildDecisionExplanation({
        item,
        role: "support",
        scoreBreakdown,
      }),
      metadata: {
        experienceType: getExperienceType(item),
        area: item.experience.area,
        themeCluster: item.themeCluster,
        expectedFatigue: item.experience.fatigue,
        estimatedDuration: item.experience.recommendedDuration,
        feasible: true,
      },
    };
  });
}

  const duplicatePolicyUsed = Object.values(optionsByRole).some((options) =>
    hasDuplicateExperienceType(options),
  );

  const fallbackUsed = Object.values(optionsByRole).some(
    (options) => options.length < DECISION_OPTION_COUNT_PER_ROLE,
  );

  return {
    dayIndex: dayPlan.day,
    structureType,
    roleSequence: [...DAY_STRUCTURE_TEMPLATES[structureType]],
    options: optionsByRole,
    diagnostics: {
      candidateCounts: {
        peak: optionsByRole.peak.length,
        recovery: optionsByRole.recovery.length,
        support: optionsByRole.support.length,
      },
      feasibilityFilteredCount,
      duplicatePolicyUsed,
      fallbackUsed,
      notes: [
        `structure=${structureType}`,
        `peak=${optionsByRole.peak.length}`,
        `recovery=${optionsByRole.recovery.length}`,
        `support=${optionsByRole.support.length}`,
      ],
    },
  };
}

export function classifyDecisionRole(
  item: PlannedExperience,
  dayPlan?: DayPlan,
): DecisionFlowRole {
  const experienceId = item.experience.id;

  const selectionItem = dayPlan?.selection?.items?.find(
    (selected) => selected.experienceId === experienceId,
  );

  if (selectionItem?.role === "peak_candidate") return "peak";
  if (selectionItem?.role === "recovery_candidate") return "recovery";

  if (dayPlan?.pins?.peak?.experienceId === experienceId) return "peak";
  if (dayPlan?.pins?.recovery?.experienceId === experienceId) return "recovery";

  if (item.functionalRole === "anchor" || item.functionalRole === "viewpoint") {
    return "peak";
  }

  if (
    item.functionalRole === "rest" ||
    item.functionalRole === "transition_safe" ||
    item.experience.fatigue <= 2
  ) {
    return "recovery";
  }

  return "support";
}

export function calculateDecisionScore(params: {
  item: PlannedExperience;
  role: DecisionFlowRole;
  dayPlan: DayPlan;
  input: PlanningInput;
  userVector: UserVector;
}): DecisionOption["scoreBreakdown"] {
  const { item, role, dayPlan, input, userVector } = params;

  const preferenceMatch = calculatePreferenceMatch(item, userVector);
  const behaviorAlignment = calculateBehaviorAlignment(item, input);
  const flowFit = calculateFlowFit(item, role);
  const constraintRisk = calculateConstraintRisk(item, dayPlan, input);

  const finalScore =
    DECISION_SCORE_WEIGHTS.preferenceMatch * preferenceMatch +
    DECISION_SCORE_WEIGHTS.behaviorAlignment * behaviorAlignment +
    DECISION_SCORE_WEIGHTS.flowFit * flowFit -
    DECISION_SCORE_WEIGHTS.constraintRisk * constraintRisk;

  return {
    preferenceMatch,
    behaviorAlignment,
    flowFit,
    constraintRisk,
    finalScore: clamp01(finalScore),
  };
}

export function applyDecisionDiversityPolicy(
  options: DecisionOption[],
): DecisionOption[] {
  const sorted = [...options].sort(
    (a, b) => b.scoreBreakdown.finalScore - a.scoreBreakdown.finalScore,
  );

  const selected: DecisionOption[] = [];
  const usedTypes = new Set<string>();

  for (const option of sorted) {
    if (selected.length >= 2) break;

    if (!usedTypes.has(option.metadata.experienceType)) {
      selected.push(option);
      usedTypes.add(option.metadata.experienceType);
    }
  }

  for (const option of sorted) {
    if (selected.length >= DECISION_OPTION_COUNT_PER_ROLE) break;
    if (selected.some((current) => current.id === option.id)) continue;

    const isDuplicate = usedTypes.has(option.metadata.experienceType);

    selected.push(
      isDuplicate
        ? {
            ...option,
            explanation: {
              ...option.explanation,
              duplicateDifference:
                option.explanation.duplicateDifference ??
                buildDuplicateDifference(option, selected),
            },
          }
        : option,
    );

    usedTypes.add(option.metadata.experienceType);
  }

  return selected;
}

export function buildDecisionExplanation(params: {
  item: PlannedExperience;
  role: DecisionFlowRole;
  scoreBreakdown: DecisionOption["scoreBreakdown"];
  isDuplicate?: boolean;
}): DecisionOption["explanation"] {
  const { item, role, scoreBreakdown, isDuplicate } = params;
  const placeName = item.experience.placeName;

  return {
    whyRecommended: `${placeName}은(는) 사용자 선호와 ${toPercent(
      scoreBreakdown.preferenceMatch,
    )} 수준으로 맞는 경험입니다.`,
    roleReason: getRoleReason(role),
    tradeOff: buildTradeOff(item, scoreBreakdown),
    ...(isDuplicate
      ? {
          duplicateDifference: `${placeName}은(는) 같은 유형의 다른 후보와 비교해 피로도, 위치, 역할이 다릅니다.`,
        }
      : {}),
  };
}

function buildOptionsForRole(
  items: PlannedExperience[],
  role: DecisionFlowRole,
  dayPlan: DayPlan,
  input: PlanningInput,
  userVector: UserVector,
): DecisionOption[] {
  const candidates = items
    .filter((item) => classifyDecisionRole(item, dayPlan) === role)
    .filter((item) => isDecisionFeasible(item, dayPlan, input));

  const rawOptions = candidates.map((item, index) => {
    const scoreBreakdown = calculateDecisionScore({
      item,
      role,
      dayPlan,
      input,
      userVector,
    });

    const option: DecisionOption = {
      id: `${dayPlan.day}-${role}-${item.experience.id}-${index}`,
      experienceId: item.experience.id,
      role,
      title: item.experience.baseExperienceLabel || item.experience.placeName,
      scoreBreakdown,
      explanation: buildDecisionExplanation({
        item,
        role,
        scoreBreakdown,
      }),
      metadata: {
        experienceType: getExperienceType(item),
        area: item.experience.area,
        themeCluster: item.themeCluster,
        expectedFatigue: item.experience.fatigue,
        estimatedDuration: item.experience.recommendedDuration,
        feasible: true,
      },
    };

    return option;
  });

  return applyDecisionDiversityPolicy(rawOptions);
}

function resolveDecisionDayStructureType(
  dayPlan: DayPlan,
): DecisionDayStructureType {
  const skeletonType = dayPlan.selection?.skeletonType;

  if (skeletonType === "peak_centric") return "peak_centric";
  if (skeletonType === "relaxed") return "relaxed";

  return "balanced";
}

function dedupePlannedExperiences(
  items: PlannedExperience[],
): PlannedExperience[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    if (seen.has(item.experience.id)) return false;
    seen.add(item.experience.id);
    return true;
  });
}

function isDecisionFeasible(
  item: PlannedExperience,
  dayPlan: DayPlan,
  input: PlanningInput,
): boolean {
  if (input.blockedAreas?.includes(item.experience.area)) return false;

  const budget = dayPlan.timeBudget;
  if (!budget) return true;
  if (budget.isFeasible) return true;

  if (item.priority === "optional") return false;

  return item.experience.recommendedDuration <= budget.availableMin * 0.5;
}

function calculatePreferenceMatch(
  item: PlannedExperience,
  userVector: UserVector,
): number {
  const total = USER_VECTOR_KEYS.reduce((sum, key) => {
    const userValue = userVector[key] ?? 0;
    const experienceValue = item.experience.features[key] ?? 0;
    return sum + (1 - Math.abs(userValue - experienceValue));
  }, 0);

  return clamp01(total / USER_VECTOR_KEYS.length);
}

function calculateBehaviorAlignment(
  item: PlannedExperience,
  input: PlanningInput,
): number {
  const companionFit = item.experience.companionFit[input.companionType] ?? 0.5;

  const densityFit =
    input.dailyDensity >= 4
      ? item.experience.fatigue >= 3
        ? 0.8
        : 0.5
      : item.experience.fatigue <= 3
        ? 0.8
        : 0.4;

  const areaFit = input.preferredAreas?.includes(item.experience.area) ? 1 : 0.7;

  return clamp01((companionFit + densityFit + areaFit) / 3);
}

function calculateFlowFit(
  item: PlannedExperience,
  role: DecisionFlowRole,
): number {
  const fatigue = item.experience.fatigue;

  if (role === "peak") {
    return clamp01(
      (item.experience.actionStrength + (fatigue >= 3 ? 1 : 0.4)) / 2,
    );
  }

  if (role === "recovery") {
    const lowFatigueFit = fatigue <= 2 ? 1 : fatigue === 3 ? 0.6 : 0.2;
    const quietFit = item.experience.features.quiet;
    return clamp01((lowFatigueFit + quietFit) / 2);
  }

  const supportFatigueFit = fatigue <= 4 ? 0.8 : 0.4;
  return clamp01(supportFatigueFit);
}

function calculateConstraintRisk(
  item: PlannedExperience,
  dayPlan: DayPlan,
  input: PlanningInput,
): number {
  let risk = 0;

  if (input.blockedAreas?.includes(item.experience.area)) risk += 1;
  if (item.experience.fatigue > input.dailyDensity + 1) risk += 0.25;
  if (item.experience.timeFlexibility === "low") risk += 0.15;

  const budget = dayPlan.timeBudget;
  if (budget && !budget.isFeasible) risk += 0.35;

  return clamp01(risk);
}

function getExperienceType(item: PlannedExperience): string {
  return (
    item.experience.placeType ||
    item.experience.microAction ||
    item.experience.macroAction ||
    item.experience.category ||
    "unknown"
  );
}

function hasDuplicateExperienceType(options: DecisionOption[]): boolean {
  const seen = new Set<string>();

  for (const option of options) {
    if (seen.has(option.metadata.experienceType)) return true;
    seen.add(option.metadata.experienceType);
  }

  return false;
}

function buildDuplicateDifference(
  option: DecisionOption,
  selected: DecisionOption[],
): string {
  const sameType = selected.find(
    (current) =>
      current.metadata.experienceType === option.metadata.experienceType,
  );

  if (!sameType) {
    return `${option.title}은(는) 같은 역할 안에서 다른 분위기의 대안입니다.`;
  }

  return `${sameType.title}와 같은 유형이지만, ${option.title}은(는) 위치·피로도·소요시간이 다른 선택지입니다.`;
}

function getRoleReason(role: DecisionFlowRole): string {
  if (role === "peak") {
    return "이 선택지는 하루의 핵심 만족도를 만드는 peak 역할입니다.";
  }

  if (role === "recovery") {
    return "이 선택지는 피로를 낮추고 다음 경험으로 넘어가기 위한 recovery 역할입니다.";
  }

  return "이 선택지는 경험 사이의 흐름을 이어주는 support 역할입니다.";
}

function buildTradeOff(
  item: PlannedExperience,
  scoreBreakdown: DecisionOption["scoreBreakdown"],
): string {
  if (scoreBreakdown.constraintRisk >= 0.5) {
    return "현실 제약 리스크가 있어 시간·피로도 확인이 필요합니다.";
  }

  if (item.experience.fatigue >= 4) {
    return "몰입도는 높지만 피로가 누적될 수 있습니다.";
  }

  if (item.experience.timeFlexibility === "low") {
    return "시간대 제약이 있어 배치 자유도가 낮습니다.";
  }

  return "큰 제약은 낮지만, 최종 배치는 Scheduling 단계에서 검증해야 합니다.";
}

function toPercent(value: number): string {
  return `${Math.round(clamp01(value) * 100)}%`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

// ─────────────────────────────────────────────────────────────
// ENGINE ENTRY POINT
// ─────────────────────────────────────────────────────────────

/**
 * Planning → Decision Layer 연결 함수
 *
 * 기존 호환용 no-op decision layer.
 * 실제 DecisionReadyDayPlan 생성/자동 선택 fallback은 engine.ts에서 수행한다.
 */
export function applyDecisionLayer(
  dayPlans: DayPlan[],
  _input: PlanningInput,
): {
  dayPlans: DayPlan[];
  diagnostics: DecisionDiagnostics;
} {
  const diagnostics: DecisionDiagnostics = {
    days: dayPlans.map((dayPlan) => ({
      dayIndex: dayPlan.day,
      actionsTaken: ["no_op"],
      trimmedOptionalIds: [],
      suggestedFlowRebuilt: false,
      budgetBeforeMin: dayPlan.timeBudget?.estimatedTotalMin ?? 0,
      budgetAfterMin: dayPlan.timeBudget?.estimatedTotalMin ?? 0,
      notes: [
        "decision_layer:structure_preserved",
        "decision_layer:no_auto_modification",
        `structure=${dayPlan.selection?.skeletonType ?? "unknown"}`,
      ],
    })),
    totalTrimsApplied: 0,
    notes: [
      "Decision Layer MVP active",
      "Planning output preserved",
      "Scheduling input contract preserved",
      "No automatic experience replacement",
      "No automatic role change",
      "No automatic structure change",
    ],
  };

  return {
    dayPlans,
    diagnostics,
  };
}

export function convertDecisionSelectionToDayPlan(
  params: ConvertDecisionSelectionParams,
): DayPlan {
  const { sourceDayPlan, selectedOptions, structureType } = params;

  const plannedMap = buildPlannedExperienceMap(sourceDayPlan);

  const peakItem = selectedOptions.peak
    ? requirePlannedExperience(
        plannedMap,
        selectedOptions.peak.experienceId,
        "peak",
      )
    : undefined;

  const recoveryItem = selectedOptions.recovery
    ? requirePlannedExperience(
        plannedMap,
        selectedOptions.recovery.experienceId,
        "recovery",
      )
    : undefined;

  const supportItems = selectedOptions.support.map((option) =>
    requirePlannedExperience(plannedMap, option.experienceId, "support"),
  );

  const sourcePoolCount =
    sourceDayPlan.anchor.length +
    sourceDayPlan.core.length +
    sourceDayPlan.optional.length;

  const targetItemCount =
    sourceDayPlan.selection?.targetItemCount ??
    sourceDayPlan.suggestedFlow?.length ??
    sourceDayPlan.roughOrder.length ??
    sourcePoolCount;

  const sourceOrderIds =
    sourceDayPlan.suggestedFlow && sourceDayPlan.suggestedFlow.length > 0
      ? sourceDayPlan.suggestedFlow
      : sourceDayPlan.roughOrder;

  const oldPeakId = sourceDayPlan.selection?.peakCandidateId;
  const oldRecoveryId = sourceDayPlan.selection?.recoveryCandidateId;

  const selectedIds = new Set<string>();
  const orderedItems: PlannedExperience[] = [];

  function pushUnique(item?: PlannedExperience): void {
    if (!item) return;

    const id = item.experience.id;
    if (selectedIds.has(id)) return;

    orderedItems.push(item);
    selectedIds.add(id);
  }

  for (const id of sourceOrderIds) {
    if (oldPeakId && id === oldPeakId && peakItem) {
      pushUnique(peakItem);
      continue;
    }

    if (oldRecoveryId && id === oldRecoveryId && recoveryItem) {
      pushUnique(recoveryItem);
      continue;
    }

    pushUnique(plannedMap.get(id));
  }

  pushUnique(peakItem);

  for (const supportItem of supportItems) {
    pushUnique(supportItem);
  }

  pushUnique(recoveryItem);

  const fallbackItems = [
    ...sourceDayPlan.anchor,
    ...sourceDayPlan.core,
    ...sourceDayPlan.optional,
    ...(sourceDayPlan.lateFallbackReserve ?? []),
  ];

  for (const item of fallbackItems) {
    if (orderedItems.length >= targetItemCount) break;
    pushUnique(item);
  }

  const dedupedOrderedItems = dedupePlannedExperiences(
    orderedItems.slice(0, targetItemCount),
  );

  const suggestedFlow = dedupedOrderedItems.map((item) => item.experience.id);

  const nextAnchor = peakItem ? [peakItem] : sourceDayPlan.anchor;
  const nextAnchorIds = new Set(nextAnchor.map((item) => item.experience.id));

  const nextCore = dedupedOrderedItems.filter((item) => {
  const id = item.experience.id;

  if (id === peakItem?.experience.id) return false;
  if (id === recoveryItem?.experience.id) return false;

  return true;
});

  const nextOptional = sourceDayPlan.optional.filter((item) => {
  const id = item.experience.id;

  if (id === recoveryItem?.experience.id) return false;

  return !suggestedFlow.includes(id);
});

  return {
    ...sourceDayPlan,

    anchor: nextAnchor,
    core: nextCore,
    optional: nextOptional,

    roughOrder: suggestedFlow,
    suggestedFlow,

    selection: {
      skeletonType: structureType,
      hardCap: sourceDayPlan.selection?.hardCap ?? targetItemCount,
      targetItemCount,
      peakCandidateId:
        peakItem?.experience.id ?? sourceDayPlan.selection?.peakCandidateId,
      recoveryCandidateId:
        recoveryItem?.experience.id ??
        sourceDayPlan.selection?.recoveryCandidateId,
      lateFallbackIds: sourceDayPlan.selection?.lateFallbackIds ?? [],
      selectedOrder: suggestedFlow,
      spareCapacity: Math.max(0, targetItemCount - dedupedOrderedItems.length),
      items: dedupedOrderedItems.map((item) => ({
        experienceId: item.experience.id,
        role:
          item.experience.id === peakItem?.experience.id
            ? "peak_candidate"
            : item.experience.id === recoveryItem?.experience.id
              ? "recovery_candidate"
              : "core_support",
        priority: item.priority,
        planningTier: item.planningTier,
        functionalRole: item.functionalRole,
        planningScore: item.planningScore,
      })),
    },

    pins: {
      ...sourceDayPlan.pins,
      peak: peakItem
        ? {
            experienceId: peakItem.experience.id,
            flowRole: "peak",
            confidence: "hard",
          }
        : sourceDayPlan.pins?.peak,
      recovery: recoveryItem
        ? {
            experienceId: recoveryItem.experience.id,
            flowRole: "recovery",
            confidence: "hard",
          }
        : sourceDayPlan.pins?.recovery,
    },

    lateFallbackReserve: sourceDayPlan.lateFallbackReserve ?? [],
    fallbackPool: sourceDayPlan.fallbackPool ?? [],
  };
}

function buildPlannedExperienceMap(
  dayPlan: DayPlan,
): Map<string, PlannedExperience> {
  const items = [
    ...dayPlan.anchor,
    ...dayPlan.core,
    ...dayPlan.optional,
    ...(dayPlan.lateFallbackReserve ?? []),
  ];

  return new Map(items.map((item) => [item.experience.id, item]));
}

function requirePlannedExperience(
  plannedMap: Map<string, PlannedExperience>,
  experienceId: string,
  role: DecisionFlowRole,
): PlannedExperience {
  const item = plannedMap.get(experienceId);

  if (!item) {
    throw new Error(
      `convertDecisionSelectionToDayPlan: selected ${role} option not found in source DayPlan. experienceId=${experienceId}`,
    );
  }

  return item;
}
