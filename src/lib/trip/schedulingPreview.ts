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
  ExperienceQualityLevel,
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

  const peakOptions = options.filter((option) => option.role === "peak");
  const recoveryOptions = options.filter((option) => option.role === "recovery");
  const supportOptions = options.filter((option) => option.role === "support");

  const hasPeak = peakOptions.length > 0;
  const hasRecovery = recoveryOptions.length > 0;

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

  if (hasPeak && !hasRecovery) {
    conflicts.push({
      type: "recovery_missing",
      severity: "high",
      affectedOptionIds: selectedOptionIds,
      affectedExperienceIds: selectedExperienceIds,
      message: "peak 선택은 있지만 회복 역할의 선택지가 없어 후반부 만족도 저하 위험이 크다.",
      reason: "peak selected without recovery option",
    });
  }

  for (const recoveryOption of recoveryOptions) {
    const metadata = experienceMap.get(recoveryOption.experienceId);

    if (!metadata) {
      conflicts.push({
        type: "recovery_placement_risk",
        severity: "low",
        affectedOptionIds: [recoveryOption.id],
        affectedExperienceIds: [recoveryOption.experienceId],
        message: "recovery 선택지의 메타데이터를 찾지 못해 실제 배치 안정성을 판단하기 어렵다.",
        reason: "missing recovery metadata",
      });
      continue;
    }

    const narrowTimeWindow =
      metadata.timeFlexibility === "low" || metadata.allowedTimes.length <= 1;

    const notEasyRecovery =
      metadata.fatigue >= 4 ||
      (!metadata.isMeal &&
        metadata.features.quiet < 0.45 &&
        metadata.timeFlexibility !== "high");

    if (narrowTimeWindow || notEasyRecovery) {
      conflicts.push({
        type: "recovery_placement_risk",
        severity: narrowTimeWindow ? "medium" : "low",
        affectedOptionIds: [recoveryOption.id],
        affectedExperienceIds: [recoveryOption.experienceId],
        message: "선택된 recovery가 실제 일정 후반에 안정적으로 배치되지 못할 위험이 있다.",
        reason: [
          `timeFlexibility=${metadata.timeFlexibility}`,
          `allowedTimes=${metadata.allowedTimes.join(",") || "none"}`,
          `fatigue=${metadata.fatigue}`,
          `quiet=${metadata.features.quiet}`,
        ].join("|"),
      });
    }
  }

  for (const peakOption of peakOptions) {
    const metadata = experienceMap.get(peakOption.experienceId);

    if (!metadata) {
      conflicts.push({
        type: "peak_placement_risk",
        severity: "medium",
        affectedOptionIds: [peakOption.id],
        affectedExperienceIds: [peakOption.experienceId],
        message: "peak 선택지의 메타데이터를 찾지 못해 실제 배치 안정성을 판단하기 어렵다.",
        reason: "missing peak metadata",
      });
      continue;
    }

    const narrowPeakWindow =
      metadata.timeFlexibility === "low" || metadata.allowedTimes.length <= 1;

    const latePeak =
      metadata.preferredTime === "sunset" ||
      metadata.preferredTime === "dinner" ||
      metadata.preferredTime === "night";

    const lowBuffer = analysis.bufferMinutes < 180;

    if (narrowPeakWindow || (latePeak && lowBuffer)) {
      conflicts.push({
        type: "peak_placement_risk",
        severity: narrowPeakWindow ? "medium" : "low",
        affectedOptionIds: [peakOption.id],
        affectedExperienceIds: [peakOption.experienceId],
        message: "선택된 peak가 선호 시간대나 좁은 시간창 때문에 실제 배치에서 충돌할 위험이 있다.",
        reason: [
          `preferredTime=${metadata.preferredTime}`,
          `timeFlexibility=${metadata.timeFlexibility}`,
          `allowedTimes=${metadata.allowedTimes.join(",") || "none"}`,
          `bufferMinutes=${analysis.bufferMinutes}`,
        ].join("|"),
      });
    }
  }

  const timeWindowSensitiveOptions = options.filter((option) => {
    const metadata = experienceMap.get(option.experienceId);
    if (!metadata) return false;

    return metadata.timeFlexibility === "low" || metadata.allowedTimes.length <= 1;
  });

  if (timeWindowSensitiveOptions.length >= 2) {
    conflicts.push({
      type: "time_window",
      severity: "medium",
      affectedOptionIds: timeWindowSensitiveOptions.map((option) => option.id),
      affectedExperienceIds: timeWindowSensitiveOptions.map(
        (option) => option.experienceId,
      ),
      message: "시간창이 좁은 선택지가 여러 개 있어 실제 배치 순서에서 충돌할 수 있다.",
      reason: `timeWindowSensitiveCount=${timeWindowSensitiveOptions.length}`,
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

  if (hasPeak && !hasRecovery) {
    conflicts.push({
      type: "sequence",
      severity: "medium",
      affectedOptionIds: selectedOptionIds,
      affectedExperienceIds: selectedExperienceIds,
      message: "peak 이후 recovery가 없어 경험 흐름이 급격하게 끝날 수 있다.",
      reason: "peak selected without recovery",
    });
  }

  if (hasPeak && hasRecovery && supportOptions.length === 0) {
    conflicts.push({
      type: "selection_schedule_mismatch",
      severity: "low",
      affectedOptionIds: selectedOptionIds,
      affectedExperienceIds: selectedExperienceIds,
      message: "선택 구조가 peak/recovery만으로 단순해 실제 scheduling 결과와 preview 판단이 어긋날 수 있다.",
      reason: "selected only peak/recovery; converted DayPlan may include or drop different structural items",
    });
  }

  return conflicts;
}

function evaluateExperienceQuality(options: DecisionOption[]): {
  quality: ExperienceQualityLevel;
  qualityScore: number;
  qualitySummary: string;
} {
  const hasPeak = options.some((option) => option.role === "peak");
  const hasRecovery = options.some((option) => option.role === "recovery");
  const supportCount = options.filter((option) => option.role === "support").length;

  let qualityScore = 0;

  if (hasPeak) qualityScore += 40;
  if (hasRecovery) qualityScore += 30;
  qualityScore += Math.min(supportCount, 2) * 15;

  if (qualityScore >= 85) {
    return {
      quality: "rich",
      qualityScore,
      qualitySummary:
        "peak/recovery/support가 함께 구성되어 경험 밀도와 흐름이 풍부하다.",
    };
  }

  if (qualityScore >= 70) {
    return {
      quality: "balanced",
      qualityScore,
      qualitySummary:
        "핵심 경험과 회복 경험이 함께 있어 기본적인 흐름은 안정적이다.",
    };
  }

  if (qualityScore >= 50) {
    return {
      quality: "flat",
      qualityScore,
      qualitySummary:
        "실행은 쉽지만 peak/recovery 중심으로 단순해 경험 밀도는 낮을 수 있다.",
    };
  }

  return {
    quality: "weak",
    qualityScore,
    qualitySummary:
      "경험 구조가 약하다. peak 또는 recovery 역할이 부족해 하루 만족 구조가 불안정할 수 있다.",
  };
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

  if (conflicts.some((conflict) => conflict.type === "recovery_missing")) {
    tradeOffs.push("recovery 없이 peak를 유지하면 강한 경험은 남지만 하루의 마무리 만족도가 불안정해진다.");
  }

  if (conflicts.some((conflict) => conflict.type === "recovery_placement_risk")) {
    tradeOffs.push("선택한 recovery를 유지하더라도 실제 시간 배치에서 탈락하거나 약화될 수 있다.");
  }

  if (conflicts.some((conflict) => conflict.type === "peak_placement_risk")) {
    tradeOffs.push("선택한 peak를 유지하면 핵심 경험은 보존되지만, 선호 시간대 충돌 가능성이 있다.");
  }

  if (conflicts.some((conflict) => conflict.type === "selection_schedule_mismatch")) {
    tradeOffs.push("preview 선택 구조와 실제 scheduling 입력 구조가 달라질 수 있어 safe 판정이 과신될 수 있다.");
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
  const recoveryOptions = options.filter((option) => option.role === "recovery");
  const peakOptions = options.filter((option) => option.role === "peak");

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

  if (
    conflicts.some((conflict) => conflict.type === "recovery_missing") &&
    peakOptions.length > 0
  ) {
    alternatives.push({
      id: "add-recovery-required",
      title: "recovery 선택 추가 필요",
      description:
        "peak 선택을 유지하려면 후반부 회복 역할의 경험을 반드시 추가해야 한다.",
      suggestedOptionIds: options.map((option) => option.id),
      suggestedExperienceIds: options.map((option) => option.experienceId),
      improves: ["recovery_missing", "sequence"],
      tradeOffs: [
        "하루 흐름의 안정성은 올라간다.",
        "전체 소요 시간은 늘어날 수 있다.",
        "사용자가 추가 선택을 해야 한다.",
      ],
    });
  }

  if (
    conflicts.some((conflict) => conflict.type === "recovery_placement_risk") &&
    recoveryOptions.length > 0
  ) {
    alternatives.push({
      id: "replace-or-relax-recovery",
      title: "recovery 후보 재선택",
      description:
        "현재 recovery가 실제 배치에서 탈락할 위험이 있으므로 더 유연한 recovery 후보를 선택한다.",
      suggestedOptionIds: options.map((option) => option.id),
      suggestedExperienceIds: options.map((option) => option.experienceId),
      improves: ["recovery_placement_risk", "time_window"],
      tradeOffs: [
        "배치 안정성은 올라간다.",
        "처음 선택한 recovery의 취향 적합도는 낮아질 수 있다.",
      ],
    });
  }

  if (conflicts.some((conflict) => conflict.type === "peak_placement_risk")) {
    alternatives.push({
      id: "adjust-peak-time",
      title: "peak 시간대 조정",
      description:
        "peak 자체는 유지하되, 선호 시간대 충돌을 줄이기 위해 peak 배치 시간을 앞당기거나 후보를 재검토한다.",
      suggestedOptionIds: options.map((option) => option.id),
      suggestedExperienceIds: options.map((option) => option.experienceId),
      improves: ["peak_placement_risk", "time_window"],
      tradeOffs: [
        "핵심 경험은 유지된다.",
        "원래 기대한 분위기나 시간대 감성은 약해질 수 있다.",
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
  const qualityResult = evaluateExperienceQuality(selectedOptions);
 const highSeverity = conflicts.some((c) => c.severity === "high");
const mediumSeverity = conflicts.some((c) => c.severity === "medium");

const realStructuralConflict = conflicts.some(
  (c) =>
    c.type === "recovery_missing" ||
    c.type === "recovery_placement_risk" ||
    c.type === "peak_placement_risk",
);

let status: SchedulingPreviewStatus;

if (highSeverity) {
  status = "conflict";
} else if (realStructuralConflict && mediumSeverity) {
  status = "conflict";
} else if (realStructuralConflict) {
  status = "tight";
} else if (analysis.status === "tight") {
  status = "tight";
} else {
  status = "safe";
}
  

  return {
    dayIndex: day.dayIndex,
    structureType: day.structureType,

    selectedOptionIds,
    selectedExperienceIds,

    feasibility: status,
    status,
    quality: qualityResult.quality,
qualityScore: qualityResult.qualityScore,
qualitySummary: qualityResult.qualitySummary,

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
