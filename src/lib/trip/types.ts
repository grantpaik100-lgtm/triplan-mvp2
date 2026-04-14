/**
 * TriPlan V3
 * Current Role:
 * - trip engine 전반의 핵심 타입 계약(PlanningInput, ExperienceMetadata, output types 등)을 정의하는 중심 타입 파일이다.
 *
 * Target Role:
 * - engine canonical contract file로 유지되어야 한다.
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
  | "drop_low_value_core";


export type FeasibilityStatus = "safe" | "tight" | "overflow";

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

export type DayPlanningDiagnostic = {
  dayIndex: number;
  targetClusterStrategy: string;
  anchorIds: string[];
  coreIds: string[];
  optionalIds: string[];
  totalScore: number;
  clusterDistribution: Partial<Record<ThemeCluster, number>>;
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

export type DayNarrativeType = "immersion" | "peak" | "recovery";

export type RhythmSlotType =
  | "warm_up"
  | "activation"
  | "emotional_peak"
  | "recovery"
  | "cool_down";

export type FlowScoreBreakdown = {
  peakReward: number;
  fatiguePenalty: number;
  travelPenalty: number;
  diversityReward: number;
  mealBalanceReward: number;
  companionReward: number;
  total: number;
};

export type DaySchedulingDiagnostic = {
  dayIndex: number;
  narrativeType: DayNarrativeType;
  primaryPeakId?: string;
  preFeasibilityStatus: FeasibilityStatus;
  estimatedTotalMin: number;
  availableMin: number;
  overflowMin: number;
  flowScoreBeforeRepair: number;
  flowScoreAfterRepair: number;
  repairs: RepairActionLog[];
  finalStatus: "scheduled" | "repaired" | "partial_fail";
  notes: string[];
};
export type SchedulingDiagnostics = {
  totalOverflowDays: number;
  totalRepairCount: number;
  days: DaySchedulingDiagnostic[];
  notes: string[];
};

export type TripDebug = {
  candidateDiagnostics: CandidateDiagnostics;
  planningDiagnostics: PlanningDiagnostics;
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
};

export type ScoredExperience = {
  experience: ExperienceMetadata;
  score: number;
  planningTier?: PlanItemTier;
  functionalRole?: FunctionalRole;
  selectionReason?: SelectionReason;
  droppedReasons?: CandidateDropReason[];
  scoreBreakdown: {
    preference: number;
    companion: number;
    timeFit: number;
    areaFit: number;
    anchorBonus: number;
    penalty: number;
  };
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

export type DayPlan = {
  day: number;
  areas: Area[];
  anchor: PlannedExperience[];
  core: PlannedExperience[];
  optional: PlannedExperience[];
  roughOrder: string[];
};

export type ScheduledItem = {
  experienceId: string;
  placeName: string;
  startSlot: number;
  endSlot: number;
  durationMinutes: number;
  priority: PriorityClass;
  planningTier?: PlanItemTier;
  functionalRole?: FunctionalRole;
  themeCluster?: ThemeCluster;
  rhythmSlotType?: RhythmSlotType;
  isPrimaryPeak?: boolean;
};

export type ScheduleIssue =
  | "time_overflow"
  | "time_window_violation"
  | "duration_violation"
  | "fatigue_overflow"
  | "area_overjump";

export type FeasibilityReport = {
  isFeasible: boolean;
  issues: ScheduleIssue[];
  totalFatigue: number;
  totalMinutes: number;
  activeMinutes: number;  // 실제 experience 시간 합
  gapMinutes: number;     // 공백 합
};

export type DaySchedule = {
  day: number;
  items: ScheduledItem[];
  report: FeasibilityReport;
};

export type TripPlanResult = {
  dayPlans: DayPlan[];
  schedules: DaySchedule[];
  debug: TripDebug;
};
