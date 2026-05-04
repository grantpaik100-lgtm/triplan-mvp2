/**
 * TriPlan V3
 * Current Role:
 * - trip engine 전반의 핵심 타입 계약(PlanningInput, ExperienceMetadata, output types 등)을 정의하는 중심 타입 파일이다.
 *
 * Target Role:
 * - engine canonical contract file로 유지되어야 한다.
 * - Scheduling V3의 sequence-first 계약(FlowRole, DaySkeletonType, sequence/timeline diagnostics)을 포함해야 한다.
 *
 * Chain:
 * - engine
 *
 * Inputs:
 * - 없음
 *
 * Outputs:
 * - shared engine types
 *
 * Called From:
 * - src/lib/trip/* 전반
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
 * - engine 전체 계약의 기준점이다.
 * - 삭제 금지.
 */

export type Area =
  | "hongdae"
  | "seongsu"
  | "itaewon"
  | "hannam"
  | "jongno"
  | "ikseondong"
  | "bukchon"
  | "jamsil"
  | "yeouido"
  | "gangnam"
  | "other";

export type TimeBucket =
  | "early_morning"
  | "morning"
  | "late_morning"
  | "lunch"
  | "afternoon"
  | "sunset"
  | "dinner"
  | "night";

export type TimeFlexibility = "low" | "medium" | "high";
export type PriorityClass = "anchor" | "core" | "optional";
export type CompanionType = "solo" | "couple" | "friends" | "family";

export type ThemeCluster =
  | "food_discovery"
  | "cafe_relax"
  | "walk_local"
  | "nature_scenery"
  | "culture_art"
  | "shopping_street"
  | "night_view"
  | "night_out"
  | "family_gentle"
  | "activity_outdoor"
  | "mixed";

export type FunctionalRole =
  | "anchor"
  | "core"
  | "optional"
  | "meal"
  | "rest"
  | "viewpoint"
  | "transition_safe";

export type PlanItemTier = "anchor" | "core" | "optional";

export type CandidateDropReason =
  | "score_too_low"
  | "duplicate_place"
  | "duplicate_category"
  | "duplicate_theme_cluster"
  | "time_window_risk"
  | "night_mismatch"
  | "meal_excess"
  | "rest_excess"
  | "mobility_mismatch"
  | "companion_mismatch"
  | "budget_mismatch"
  | "diversity_rebalance"
  | "cluster_rebalance"
  | "capacity_limit"
  | "not_selected";

export type SelectionReasonTag =
  | "must_place"
  | "must_experience"
  | "high_score"
  | "time_sensitive"
  | "night_fit"
  | "meal_requirement"
  | "rest_requirement"
  | "cluster_fit"
  | "diversity_fill"
  | "feasibility_safe"
  | "anchor_support";

export type RepairActionType =
  | "remove_optional"
  | "shrink_rest"
  | "replace_meal"
  | "remove_core"
  | "trim_transition"
  | "force_day_split"
  | "insert_recovery"
  | "move_peak_earlier"
  | "pull_day_forward"
  | "demote_peak_time_preference"
  | "drop_low_value_core"
  | "compress_duration"
  | "swap_sequence"
  | "substitute_optional"
  | "substitute_recovery";

export type FeasibilityStatus = "safe" | "tight" | "overflow";

export type ScheduleIssue =
  | "duration_violation"
  | "time_window_violation"
  | "time_overflow"
  | "fatigue_overflow"
  | "area_overjump";

export type SelectionReason = {
  tags: SelectionReasonTag[];
  summary: string;
};

export type CandidateDiagnosticItem = {
  experienceId: string;
  name: string;
  score: number;
  selected: boolean;
  tier?: PlanItemTier;
  role?: FunctionalRole;
  themeCluster?: ThemeCluster;
  reasons: SelectionReasonTag[];
  droppedBy?: CandidateDropReason[];
};

export type CandidateDiagnostics = {
  totalCandidates: number;
  selectedCount: number;
  droppedCount: number;
  byThemeCluster: Partial<Record<ThemeCluster, number>>;
  byRole: Partial<Record<FunctionalRole, number>>;
  selected: CandidateDiagnosticItem[];
  dropped: CandidateDiagnosticItem[];
};

export type PlanningSelectionRole =
  | "peak_candidate"
  | "recovery_candidate"
  | "core_support"
  | "optional_spare";

export type PlanningSelectionItem = {
  experienceId: string;
  role: PlanningSelectionRole;
  priority: PriorityClass;
  planningTier: PlanItemTier;
  functionalRole: FunctionalRole;
  planningScore: number;
};

export type PlanningSelectionSummary = {
  skeletonType: DaySkeletonType;
  hardCap: number;
  targetItemCount: number;
  peakCandidateId?: string;
  recoveryCandidateId?: string;
  lateFallbackIds?: string[];
  selectedOrder: string[];
  spareCapacity: number;
  items: PlanningSelectionItem[];
};

export type DayPlanningDiagnostic = {
  dayIndex: number;
  targetClusterStrategy: string;
  anchorIds: string[];
  coreIds: string[];
  optionalIds: string[];
  totalScore: number;
  clusterDistribution: Partial<Record<ThemeCluster, number>>;
  skeletonType?: DaySkeletonType;
  targetItemCount?: number;
  hardCap?: number;
  peakCandidateId?: string;
  recoveryCandidateId?: string;
  selectedOrder?: string[];
  spareCapacity?: number;
  notes: string[];
};

export type PlanningDiagnostics = {
  diversityMode: DiversityMode;
  totalAnchors: number;
  totalCore: number;
  totalOptional: number;
  dayPlans: DayPlanningDiagnostic[];
  notes: string[];
};

export type RepairActionLog = {
  step: number;
  action: RepairActionType;
  targetExperienceId?: string;
  beforeOverflowMin: number;
  afterOverflowMin: number;
  reason: string;
};

/**
 * Legacy narrative type.
 * planning / legacy debug 호환용으로 유지.
 */
export type DayNarrativeType = "immersion" | "peak" | "recovery";

/**
 * Scheduling V3 canonical skeleton.
 */
export type DaySkeletonType =
  | "balanced"
  | "short"
  | "extended"
  | "peak_centric"
  | "relaxed";

/**
 * Legacy rhythm slot type.
 * UI / debug compatibility 용도로 유지.
 */
export type RhythmSlotType =
  | "warm_up"
  | "activation"
  | "emotional_peak"
  | "recovery"
  | "cool_down";

/**
 * Scheduling V3 canonical flow role.
 */
export type FlowRole =
  | "opener"
  | "activation"
  | "support"
  | "peak"
  | "recovery"
  | "soft_end";

export type FlowRoleAffinity = {
  opener: number;
  activation: number;
  support: number;
  peak: number;
  recovery: number;
  softEnd: number;
};

export type ExperienceSequenceNode = {
  experienceId: string;
  placeName: string;
  priority: PriorityClass;
  planningTier?: PlanItemTier;
  functionalRole?: FunctionalRole;
  themeCluster?: ThemeCluster;
  flowRole: FlowRole;
  sequenceIndex: number;
  isPrimaryPeak?: boolean;
  roleAffinity: FlowRoleAffinity;
};

export type FlowScoreBreakdown = {
  peakReward: number;
  fatiguePenalty: number;
  travelPenalty: number;
  diversityReward: number;
  mealBalanceReward: number;
  companionReward: number;
  total: number;
};

export type SequenceDiagnostics = {
  skeletonType: DaySkeletonType;
  selectedPeakId?: string;
  selectedRecoveryId?: string;
  flowScore: number;
  smoothnessScore: number;
  fatigueScore: number;
  peakPositionScore: number;
  recoveryScore: number;
  continuityScore: number;
  notes: string[];
};

export type TimelineDiagnostics = {
  overflowMin: number;
  invalidPlacement: boolean;
  compressedExperienceIds: string[];
  substitutedExperienceIds: string[];
  droppedOptionalIds: string[];
  preservedPeak: boolean;
  preservedOriginalRecovery: boolean;
  recoveredTailRole: boolean;
  notes: string[];
};

export type DaySchedulingDiagnostic = {
  dayIndex: number;
  narrativeType: DayNarrativeType;
  skeletonType: DaySkeletonType;
  primaryPeakId?: string;
  primaryRecoveryId?: string;
  preFeasibilityStatus: FeasibilityStatus;
  estimatedTotalMin: number;
  availableMin: number;
  overflowMin: number;
  flowScoreBeforeRepair: number;
  flowScoreAfterRepair: number;
  repairs: RepairActionLog[];
  finalStatus: "scheduled" | "repaired" | "flow_degraded" | "partial_fail";
  sequenceDiagnostics: SequenceDiagnostics;
  timelineDiagnostics: TimelineDiagnostics;
  notes: string[];
};

export type SchedulingDiagnostics = {
  totalOverflowDays: number;
  totalRepairCount: number;
  days: DaySchedulingDiagnostic[];
  notes: string[];
};

export type DecisionActionType =
  | "trim_overflow_optional"
  | "rebuild_suggested_flow"
  | "no_op";

export type DayDecisionLog = {
  dayIndex: number;
  actionsTaken: DecisionActionType[];
  trimmedOptionalIds: string[];
  suggestedFlowRebuilt: boolean;
  budgetBeforeMin: number;
  budgetAfterMin: number;
  notes: string[];
};

export type DecisionDiagnostics = {
  days: DayDecisionLog[];
  totalTrimsApplied: number;
  notes: string[];
};

export type TripDebug = {
  candidateDiagnostics: CandidateDiagnostics;
  planningDiagnostics: PlanningDiagnostics;
  decisionDiagnostics: DecisionDiagnostics;   // ← 이 줄만 추가
  schedulingDiagnostics: SchedulingDiagnostics;
};

export type ExperienceFeatures = {
  food: number;
  culture: number;
  nature: number;
  shopping: number;
  entertainment: number;

  quiet: number;
  romantic: number;
  local: number;
  touristy: number;
  luxury: number;
  hipster: number;
  traditional: number;

  walkIntensity: number;
  crowdLevel: number;
  activityIntensity: number;
  cost: number;
};

export type CompanionFit = {
  solo: number;
  couple: number;
  friends: number;
  family: number;
};

export type ExperienceMetadata = {
  id: string;
  placeId: string;

  placeName: string;
  regionRaw: string;
  area: Area;

  category: string;
  placeType: string;

  macroAction: string;
  microAction: string;
  actionStrength: number;
  isPrimaryAction: boolean;

  baseExperienceLabel: string;

  preferredTime: TimeBucket;
  allowedTimes: TimeBucket[];
  timeFlexibility: TimeFlexibility;

  minDuration: number;
  recommendedDuration: number;

  fatigue: 1 | 2 | 3 | 4 | 5;

  isMeal: boolean;
  isIndoor: boolean;
  isNightFriendly: boolean;

  companionFit: CompanionFit;
  features: ExperienceFeatures;

  themeCluster?: ThemeCluster;
  functionalRoleHints?: FunctionalRole[];

  priorityHints: {
    canBeAnchor: boolean;
    anchorReasons: string[];
  };

  review: {
    manualReview: boolean;
    mappingNotes?: string;
  };
};

export type UserVector = {
  food: number;
  culture: number;
  nature: number;
  shopping: number;
  entertainment: number;

  quiet: number;
  romantic: number;
  local: number;
  touristy: number;
  luxury: number;
  hipster: number;
  traditional: number;

  walkIntensity: number;
  crowdLevel: number;
  activityIntensity: number;
  cost: number;
};

export type DiversityMode = "diverse" | "balanced" | "theme_focused";

export type PlanningInput = {
  days: number;
  companionType: CompanionType;
  dailyStartSlot: number;
  dailyEndSlot: number;
  dailyDensity: 1 | 2 | 3 | 4 | 5;
  diversityMode: DiversityMode;
  mustExperienceIds?: string[];
  preferredAreas?: Area[];
  blockedAreas?: Area[];

  // 생체 리듬
  chronotype?: "morning" | "neutral" | "night";
  // 휴식 정책
  restPolicy?: "frequent" | "normal" | "minimal";
  // 야간 활동
  nightActive?: boolean;
  // 혼잡도 민감도
  crowdSensitivity?: "low" | "mid" | "high";
  // 예산 티어
  budgetTier?: "tight" | "normal" | "premium";
  // 분위기 선호 (자유 텍스트)
  emotionalContext?: string | null;
  // must places (이름 기반, DB 매칭 전 단계)
  mustPlaceNames?: string[];
};

export type ScoredExperience = {
  experience: ExperienceMetadata;
  score: number;
  scoreBreakdown?: {
    preference: number;
    companion: number;
    timeFit: number;
    areaFit: number;
    anchorBonus: number;
    penalty: number;
  };
  planningTier?: PlanItemTier;
  functionalRole?: FunctionalRole;
  selectionReason?: SelectionReason;
  droppedReasons?: CandidateDropReason[];
};

export type PlannedExperience = {
  experience: ExperienceMetadata;
  priority: PriorityClass;
  planningTier: PlanItemTier;
  functionalRole: FunctionalRole;
  themeCluster?: ThemeCluster;
  planningScore: number;
  selectionReason?: SelectionReason;
};

export type ScheduledItem = {
  experienceId: string;
  placeName: string;
  startSlot: number;
  endSlot: number;
  durationMinutes: number;
  priority: PriorityClass;
  planningTier: PlanItemTier;
  functionalRole: FunctionalRole;
  themeCluster?: ThemeCluster;
  flowRole: FlowRole;
  rhythmSlotType: RhythmSlotType;
  isPrimaryPeak: boolean;
};

export type FeasibilityReport = {
  isFeasible: boolean;
  issues: ScheduleIssue[];
  totalFatigue: number;
  totalMinutes: number;
  activeMinutes: number;
  gapMinutes: number;
};

export type DaySchedule = {
  day: number;
  items: ScheduledItem[];
  report: FeasibilityReport;
};

export type PinConfidence = "hard" | "soft";

export type StructuralPin = {
  experienceId: string;
  flowRole: FlowRole;
  confidence: PinConfidence;
};

export type PlanningTimeBudget = {
  isFeasible: boolean;
  estimatedTotalMin: number;
  availableMin: number;
  bufferMin: number;
  overEstimatedMin: number;
};

export type FallbackEntry = {
  experienceId: string;
  planningScore: number;
  functionalRole: FunctionalRole;
  preferredPosition: "post_peak" | "any";
};

export type DayPlan = {
  day: number;
  areas: Area[];
  anchor: PlannedExperience[];
  core: PlannedExperience[];
  optional: PlannedExperience[];
  roughOrder: string[];
  lateFallbackReserve?: PlannedExperience[];
  selection?: PlanningSelectionSummary;
  pins?: {
    peak?: StructuralPin;
    recovery?: StructuralPin;
    opener?: StructuralPin;
  };
  timeBudget?: PlanningTimeBudget;
  suggestedFlow?: string[];
  fallbackPool?: FallbackEntry[];
};

export type TripPlanResult = {
  dayPlans: DayPlan[];
  schedules: DaySchedule[];
  debug: TripDebug;
};

// ─── CharacterProfile ────────────────────────────────────────────────────────

export type CharacterProfile = {
  primaryType: "rest" | "schedule" | "mood" | "strategy";
  userVector: UserVector;
  planningPolicy: {
    maxDailyDensity: 1 | 2 | 3 | 4 | 5;
    recoveryLevel: "hard" | "soft" | "implicit";
    peakStructure: "single" | "double_wave";
    eveningActivation: boolean;
  };
};
// ─── Decision Layer ──────────────────────────────────────────────────────────
//
// Decision Layer 전용 타입 계약.
// engine 파이프라인(Scoring → Planning → Scheduling) 구조를 변경하지 않는다.
// DaySkeletonType / FlowRole의 subset을 사용하지만, Decision Layer 계약으로 별도 정의한다.

/**
 * Decision Layer가 사용자에게 제시하는 하루 구조 유형.
 * DaySkeletonType("short" | "extended" 제외)의 UI-facing subset.
 */
export type DayStructureType = "balanced" | "peak_centric" | "relaxed";

/**
 * Decision Layer에서 각 option이 담당하는 역할.
 * FlowRole의 decision-facing subset.
 */
export type DecisionFlowRole = "peak" | "recovery" | "support";

/**
 * 사용자에게 제시되는 하나의 선택지.
 * role별 3개 고정.
 */
export type DecisionOption = {
  experienceId: string;
  placeName: string;
  role: DecisionFlowRole;
  planningScore: number;
  themeCluster?: ThemeCluster;
};

/**
 * Decision Layer가 사용자에게 제시하는 day plan 계약.
 * 기존 DayPlan을 변경하지 않는 독립 wrapper.
 * options는 role별 정확히 3개 tuple.
 */
export type DecisionReadyDayPlan = {
  dayIndex: number;
  structureType: DayStructureType;
  options: {
    peak: [DecisionOption, DecisionOption, DecisionOption];
    recovery: [DecisionOption, DecisionOption, DecisionOption];
    support: [DecisionOption, DecisionOption, DecisionOption];
  };
};

/**
 * 사용자가 role별로 내린 선택 기록.
 */
export type UserChoiceLog = {
  dayIndex: number;
  role: DecisionFlowRole;
  chosenExperienceId: string;
  chosenAt: number; // Unix timestamp (ms)
};

/**
 * Decision scoring에 사용하는 가중치.
 * 합계 = 1.0 권장 (강제하지 않음, MVP 기준).
 */
export type DecisionScoreWeights = {
  planningScore: number;
  companionFit: number;
  themeCoherence: number;
  fatigueBalance: number;
};
