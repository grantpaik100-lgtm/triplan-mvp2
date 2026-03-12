// src/engine/types.ts

export type PrimaryAxis = "rest" | "schedule" | "mood" | "strategy";

export type ThemeAxis =
  | "food"
  | "culture"
  | "nature"
  | "shopping"
  | "activity"
  | "atmosphere"
  | "tourism";

export type PlaceVector = {
  food: number;
  culture: number;
  nature: number;
  shopping: number;
  activity: number;
  atmosphere: number;
  tourism: number;
  price: number;
  crowd: number;
  duration: number;
};

export type Place = {
  id: string;
  name: string;
  region: string | null;
  category: string | null;
  lat: number | null;
  lng: number | null;
  avg_duration_min: number | null;
  price_level: number | null;
  crowd_level: number | null;
  status: string | null;
  vector: PlaceVector | null;
};

export type PrimarySurveyResult = {
  rest: number;
  schedule: number;
  mood: number;
  strategy: number;
};

export type SecondarySurveyResult = {
  city?: string;
  days: number;
  companion?: string;
  budget_level?: number;
  pace?: number;
  chronotype?: "morning" | "neutral" | "night";
  walk_tolerance?: number;
  waiting_tolerance?: number;
  food_importance?: number;
  daily_density: number;
  must_place_ids?: string[];
  must_foods?: string[];
  must_experiences?: string[];
};

export type UserPreferenceVector = {
  food: number;
  culture: number;
  nature: number;
  shopping: number;
  activity: number;
  atmosphere: number;
  tourism: number;
  price: number;
  crowd: number;
  duration: number;
};

export type UserModel = {
  city: string;
  days: number;
  companion: string | null;
  primary: PrimarySurveyResult;
  secondary: SecondarySurveyResult;
  preferenceVector: UserPreferenceVector;
  constraints: {
    dailyDensity: number;
    placesPerDay: number;
    budgetLevel: number;
    walkTolerance: number;
    waitingTolerance: number;
    pace: number;
    chronotype: "morning" | "neutral" | "night";
  };
  must: {
    placeIds: string[];
    foods: string[];
    experiences: string[];
  };
};

export type ScoreBreakdown = {
  axisAffinity: number;
  budgetPenalty: number;
  crowdPenalty: number;
  durationPenalty: number;
  finalScore: number;
};

export type ScoredPlace = {
  place: Place;
  score: number;
  breakdown: ScoreBreakdown;
};

export type Candidate = ScoredPlace;

export type DayPlan = {
  day: number;
  theme: ThemeAxis;
  places: ScoredPlace[];
  total_estimated_duration_min: number;
  regions: string[];
  categories: string[];
};

export type TripPlanResult = {
  userModel: UserModel;
  candidates: ScoredPlace[];
  schedule: DayPlan[];
  meta: {
    candidate_count: number;
    total_selected: number;
    places_per_day: number;
    days: number;
  };
};

export type ScheduleResult = {
  days: DayPlan[];
};

export type PlanTripInput = {
  primary: PrimarySurveyResult;
  secondary: SecondarySurveyResult;
};
