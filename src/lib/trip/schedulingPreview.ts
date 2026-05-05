/**
 * TriPlan V4
 * Current Role:
 * - 사용자 선택 결과를 기반으로 실행 가능성/충돌/trade-off를 분석하는 Scheduling Preview Engine이다.
 *
 * Target Role:
 * - Decision Layer 이후, 사용자가 선택한 경험 조합의 현실적 결과를 분석하는 canonical preview engine이어야 한다.
 *
 * Chain:
 * - decision → schedulingPreview → user confirmation
 *
 * Inputs:
 * - DecisionSelectedOptions
 * - DecisionDayStructureType
 * - ExperienceMetadata[]
 * - availableMinutes
 *
 * Outputs:
 * - SchedulingPreviewResult
 *
 * Called From:
 * - 이후 generate route 또는 decision confirmation flow
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
 * - 기존 scheduling.ts / scheduleDayPlan을 대체하지 않는다.
 * - 선택된 경험을 제거하거나 교체하지 않는다.
 * - Preview는 분석과 대안 제시만 수행한다.
 */

import type {
  DecisionDayStructureType,
  DecisionOption,
  DecisionSelectedOptions,
  ExperienceMetadata,
  SchedulingPreviewAlternative,
  SchedulingPreviewAnalysis,
  SchedulingPreviewConflict,
  SchedulingPreviewConflictType,
  SchedulingPreviewDay,
  SchedulingPreviewDiagnostics,
  SchedulingPreviewResult,
  SchedulingPreviewStatus,
} from "./types";

export type GenerateSchedulingPreviewDayInput = {
  dayIndex: number;
  structureType: DecisionDayStructureType;
  selectedOptions: DecisionSelectedOptions;
  availableMinutes: number;
};

export type GenerateSchedulingPreviewParams = {
  days: GenerateSchedulingPreviewDayInput[];
  experiences: ExperienceMetadata[];
};

const DEFAULT_TRAVEL_MINUTES_BETWEEN_EXPERIENCES = 30;
const SAFE_BUFFER_MINUTES = 45;
const TIGHT_BUFFER_MINUTES = 15;
const SAFE_FATIGUE_LIMIT = 10;
const TIGHT_FATIGUE_LIMIT = 14;

function flattenSelectedOptions(
  selectedOptions: DecisionSelectedOptions,
): DecisionOption[] {
  return [
    selectedOptions.peak,
    selectedOptions.recovery,
    ...selectedOptions.support,
  ].filter((option): option is DecisionOption => Boolean(option));
}

function buildExperienceMap(
  experiences: ExperienceMetadata[],
): Map<string, ExperienceMetadata> {
  return new Map(experiences.map((experience) => [experience.id, experience]));
}

function getExperienceDuration(
  option: DecisionOption,
  experienceMap: Map<string, ExperienceMetadata>,
): number {
  const metadata = experienceMap.get(option.experienceId);

  return (
    metadata?.recommendedDuration ??
    option.metadata.estimatedDuration ??
    90
  );
}

function getExperienceFatigue(
  option: DecisionOption,
  experienceMap: Map<string, ExperienceMetadata>,
): number {
  const metadata = experienceMap.get(option.experienceId);

  return metadata?.fatigue ?? option.metadata.expectedFatigue ?? 3;
}

function estimateTravelMinutes(optionCount: number): number {
  if (optionCount <= 1) return 0;

  return (optionCount - 1) * DEFAULT_TRAVEL_MINUTES_BETWEEN_EXPERIENCES;
}

function getSelectedExperienceIds(options: DecisionOption[]): string[] {
  return options.map((option) => option.experienceId);
}

function getSelectedOptionIds(options: DecisionOption[]): string[] {
  return options.map((option) => option.id);
}

function calculatePreviewAnalysis(params: {
  options: DecisionOption[];
  availableMinutes: number;
  experienceMap: Map<string, ExperienceMetadata>;
}): SchedulingPreviewAnalysis {
  const { options, availableMinutes, experienceMap } = params;

  const experienceMinutes = options.reduce((sum, option) => {
    return sum + getExperienceDuration(option, experienceMap);
  }, 0);

  const estimatedTravelMinutes = estimateTravelMinutes(options.length);
  const estimatedTotalMinutes = experienceMinutes + estimatedTravelMinutes;

  const estimatedFatigue = options.reduce((sum, option) => {
    return sum + getExperienceFatigue(option, experienceMap);
  }, 0);

  const bufferMinutes = availableMinutes - estimatedTotalMinutes;

  const status = getPreviewStatus({
    bufferMinutes,
    estimatedFatigue,
  });

  return {
    estimatedTotalMinutes,
    availableMinutes,
    estimatedTravelMinutes,
    estimatedFatigue,
    bufferMinutes,
    status,
    summary: buildAnalysisSummary({
      status,
      estimatedTotalMinutes,
      availableMinutes,
      estimatedFatigue,
      bufferMinutes,
    }),
  };
}

function getPreviewStatus(params: {
  bufferMinutes: number;
  estimatedFatigue: number;
}): SchedulingPreviewStatus {
  const { bufferMinutes, estimatedFatigue } = params;

  if (bufferMinutes < 0) return "conflict";
  if (estimatedFatigue > TIGHT_FATIGUE_LIMIT) return "conflict";

  if (bufferMinutes < TIGHT_BUFFER_MINUTES) return "tight";
  if (estimatedFatigue > SAFE_FATIGUE_LIMIT) return "tight";

  return "safe";
}

function buildAnalysisSummary(params: {
  status: SchedulingPreviewStatus;
  estimatedTotalMinutes: number;
  availableMinutes: number;
  estimatedFatigue: number;
  bufferMinutes: number;
}): string {
  const {
    status,
    estimatedTotalMinutes,
    availableMinutes,
    estimatedFatigue,
    bufferMinutes,
  } = params;

  if (status === "conflict") {
    return `선택한 경험 조합은 현재 시간/피로 조건에서 충돌 가능성이 높다. 예상 ${estimatedTotalMinutes}분, 가능 ${availableMinutes}분, 피로도 ${estimatedFatigue}, 버퍼 ${bufferMinutes}분.`;
  }

  if (status === "tight") {
    return `선택한 경험 조합은 실행 가능하지만 여유가 적다. 예상 ${estimatedTotalMinutes}분, 가능 ${availableMinutes}분, 피로도 ${estimatedFatigue}, 버퍼 ${bufferMinutes}분.`;
  }

  return `선택한 경험 조합은 현재 조건에서 안정적으로 실행 가능하다. 예상 ${estimatedTotalMinutes}분, 가능 ${availableMinutes}분, 피로도 ${estimatedFatigue}, 버퍼 ${bufferMinutes}분.`;
}

function detectConflicts(params: {
  options: DecisionOption[];
  analysis: SchedulingPreviewAnalysis;
  experienceMap: Map<string, ExperienceMetadata>;
}): SchedulingPreviewConflict[] {
  const { options, analysis, experienceMap } = params;

  const conflicts: SchedulingPreviewConflict[] = [];
  const selectedOptionIds = getSelectedOptionIds(options);
  const selectedExperienceIds = getSelectedExperienceIds(options);

  if (analysis.bufferMinutes < 0) {
    conflicts.push({
      type: "time",
      severity: analysis.bufferMinutes < -60 ? "high" : "medium",
      affectedOptionIds: selectedOptionIds,
      affectedExperienceIds: selectedExperienceIds,
      message: "선택한 경험들의 총 소요 시간이 하루 사용 가능 시간을 초과한다.",
      reason: `availableMinutes=${analysis.availableMinutes}, estimatedTotalMinutes=${analysis.estimatedTotalMinutes}`,
    });
  }

  if (
    analysis.bufferMinutes >= 0 &&
    analysis.bufferMinutes < SAFE_BUFFER_MINUTES
  ) {
    conflicts.push({
      type: "time",
      severity: analysis.bufferMinutes < TIGHT_BUFFER_MINUTES ? "medium" : "low",
      affectedOptionIds: selectedOptionIds,
      affectedExperienceIds: selectedExperienceIds,
      message: "시간상 실행은 가능하지만 이동/대기/지연을 흡수할 버퍼가 부족하다.",
      reason: `bufferMinutes=${analysis.bufferMinutes}`,
    });
  }

  if (analysis.estimatedFatigue > SAFE_FATIGUE_LIMIT) {
    conflicts.push({
      type: "fatigue",
      severity:
        analysis.estimatedFatigue > TIGHT_FATIGUE_LIMIT ? "high" : "medium",
      affectedOptionIds: selectedOptionIds,
      affectedExperienceIds: selectedExperienceIds,
      message: "선택한 경험 조합의 누적 피로도가 높다.",
      reason: `estimatedFatigue=${analysis.estimatedFatigue}`,
    });
  }

  const timeWindowConflicts = options.filter((option) => {
    const metadata = experienceMap.get(option.experienceId);
    if (!metadata) return false;

    return metadata.timeFlexibility === "low" && metadata.allowedTimes.length <= 1;
  });

  if (timeWindowConflicts.length > 0 && analysis.status !== "safe") {
    conflicts.push({
      type: "time_window",
      severity: "medium",
      affectedOptionIds: timeWindowConflicts.map((option) => option.id),
      affectedExperienceIds: timeWindowConflicts.map(
        (option) => option.experienceId,
      ),
      message: "일부 선택지는 가능한 시간대가 좁아 일정 충돌 위험을 키운다.",
      reason: "low timeFlexibility with narrow allowedTimes",
    });
  }

  if (options.length >= 4 && analysis.estimatedTravelMinutes >= 90) {
    conflicts.push({
      type: "distance",
      severity: "medium",
      affectedOptionIds: selectedOptionIds,
      affectedExperienceIds: selectedExperienceIds,
      message: "선택한 경험 수가 많아 이동 시간이 누적될 가능성이 높다.",
      reason: `estimatedTravelMinutes=${analysis.estimatedTravelMinutes}`,
    });
  }

  if (
    options.some((option) => option.role === "peak") &&
    options.some((option) => option.role === "recovery") === false
  ) {
    conflicts.push({
      type: "sequence",
      severity: "low",
      affectedOptionIds: selectedOptionIds,
      affectedExperienceIds: selectedExperienceIds,
      message: "peak 이후 회복 역할의 경험이 없어 흐름이 급격하게 끝날 수 있다.",
      reason: "peak selected without recovery",
    });
  }

  return conflicts;
}

function buildTradeOffs(params: {
  analysis: SchedulingPreviewAnalysis;
  conflicts: SchedulingPreviewConflict[];
}): string[] {
  const { analysis, conflicts } = params;

  const tradeOffs: string[] = [];

  if (analysis.status === "safe") {
    tradeOffs.push("선택 유지 시 안정성이 높지만, 경험 밀도는 상대적으로 낮을 수 있다.");
  }

  if (analysis.status === "tight") {
    tradeOffs.push("선택을 유지하면 경험 밀도는 높지만, 현장 지연에 취약해진다.");
  }

  if (analysis.status === "conflict") {
    tradeOffs.push("선택을 모두 유지하면 만족도 높은 경험은 보존되지만, 실행 가능성이 낮아진다.");
  }

  if (conflicts.some((conflict) => conflict.type === "fatigue")) {
    tradeOffs.push("피로도가 높은 선택을 유지하면 후반부 경험 만족도가 떨어질 수 있다.");
  }

  if (conflicts.some((conflict) => conflict.type === "distance")) {
    tradeOffs.push("지역 이동을 감수하면 다양성은 증가하지만 체류 시간은 줄어든다.");
  }

  if (conflicts.some((conflict) => conflict.type === "time_window")) {
    tradeOffs.push("시간대가 좁은 경험을 유지하면 나머지 선택의 배치 자유도가 낮아진다.");
  }

  return tradeOffs;
}

function buildAlternatives(params: {
  options: DecisionOption[];
  conflicts: SchedulingPreviewConflict[];
}): SchedulingPreviewAlternative[] {
  const { options, conflicts } = params;

  if (conflicts.length === 0) return [];

  const supportOptions = options.filter((option) => option.role === "support");
  const alternatives: SchedulingPreviewAlternative[] = [];

  if (supportOptions.length > 0) {
    const firstSupport = supportOptions[0];

    alternatives.push({
      id: `remove-support-${firstSupport.id}`,
      title: "support 경험 1개 제외",
      description:
        "핵심 peak/recovery 선택은 유지하고, support 경험 하나를 제외해 시간과 피로도를 낮춘다.",
      suggestedOptionIds: options
        .filter((option) => option.id !== firstSupport.id)
        .map((option) => option.id),
      suggestedExperienceIds: options
        .filter((option) => option.id !== firstSupport.id)
        .map((option) => option.experienceId),
      improves: getConflictTypes(conflicts),
      tradeOffs: [
        "전체 실행 가능성은 올라간다.",
        "하루 경험의 풍부함은 줄어든다.",
        "사용자가 선택한 support 경험 하나를 포기해야 한다.",
      ],
    });
  }

  if (supportOptions.length >= 2) {
    const remainingCoreOptions = options.filter(
      (option) => option.role !== "support",
    );

    alternatives.push({
      id: "keep-peak-recovery-only",
      title: "peak/recovery 중심으로 축소",
      description:
        "사용자가 선택한 peak와 recovery를 중심으로 하루 구조를 단순화한다.",
      suggestedOptionIds: remainingCoreOptions.map((option) => option.id),
      suggestedExperienceIds: remainingCoreOptions.map(
        (option) => option.experienceId,
      ),
      improves: getConflictTypes(conflicts),
      tradeOffs: [
        "핵심 경험 보존 가능성이 높아진다.",
        "이동과 피로 리스크가 줄어든다.",
        "support 선택지의 다양성은 사라진다.",
      ],
    });
  }

  return alternatives;
}

function getConflictTypes(
  conflicts: SchedulingPreviewConflict[],
): SchedulingPreviewConflictType[] {
  return Array.from(new Set(conflicts.map((conflict) => conflict.type)));
}

function buildPreviewDay(params: {
  day: GenerateSchedulingPreviewDayInput;
  experienceMap: Map<string, ExperienceMetadata>;
}): SchedulingPreviewDay {
  const { day, experienceMap } = params;

  const selectedOptions = flattenSelectedOptions(day.selectedOptions);
  const selectedOptionIds = getSelectedOptionIds(selectedOptions);
  const selectedExperienceIds = getSelectedExperienceIds(selectedOptions);

  const analysis = calculatePreviewAnalysis({
    options: selectedOptions,
    availableMinutes: day.availableMinutes,
    experienceMap,
  });

  const conflicts = detectConflicts({
    options: selectedOptions,
    analysis,
    experienceMap,
  });

  const hasConflict = conflicts.some(
    (conflict) => conflict.severity === "medium" || conflict.severity === "high",
  );

  const status: SchedulingPreviewStatus =
    analysis.status === "conflict" || hasConflict
      ? "conflict"
      : analysis.status;

  return {
    dayIndex: day.dayIndex,
    structureType: day.structureType,

    selectedOptionIds,
    selectedExperienceIds,

    feasibility: status,
    status,

    analysis: {
      ...analysis,
      status,
    },
    conflicts,
    tradeOffs: buildTradeOffs({ analysis, conflicts }),
    alternatives: buildAlternatives({
      options: selectedOptions,
      conflicts,
    }),
    notes: [
      `selectedOptionCount=${selectedOptions.length}`,
      `availableMinutes=${day.availableMinutes}`,
      `previewStatus=${status}`,
    ],
  };
}

function buildDiagnostics(
  days: SchedulingPreviewDay[],
): SchedulingPreviewDiagnostics {
  return {
    totalDays: days.length,
    safeDays: days.filter((day) => day.status === "safe").length,
    tightDays: days.filter((day) => day.status === "tight").length,
    conflictDays: days.filter((day) => day.status === "conflict").length,
    totalConflictCount: days.reduce(
      (sum, day) => sum + day.conflicts.length,
      0,
    ),
    notes: [
      "SchedulingPreview does not mutate selected options.",
      "SchedulingPreview does not call scheduleDayPlan.",
      "SchedulingPreview is decision-facing analysis only.",
    ],
  };
}

export function generateSchedulingPreview(
  params: GenerateSchedulingPreviewParams,
): SchedulingPreviewResult {
  const experienceMap = buildExperienceMap(params.experiences);

  const days = params.days.map((day) =>
    buildPreviewDay({
      day,
      experienceMap,
    }),
  );

  return {
    days,
    diagnostics: buildDiagnostics(days),
  };
}
