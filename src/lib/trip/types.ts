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

export type PlanningInput = {
  days: number;
  companionType: CompanionType;
  dailyStartSlot: number;
  dailyEndSlot: number;
  dailyDensity: 1 | 2 | 3 | 4 | 5;
  mustExperienceIds?: string[];
  preferredAreas?: Area[];
  blockedAreas?: Area[];
};

export type ScoredExperience = {
  experience: ExperienceMetadata;
  score: number;
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
  planningScore: number;
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
};

export type DaySchedule = {
  day: number;
  items: ScheduledItem[];
  report: FeasibilityReport;
};

export type TripPlanResult = {
  dayPlans: DayPlan[];
  schedules: DaySchedule[];
};
