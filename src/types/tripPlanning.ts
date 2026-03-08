export type FollowupQuestion = {
  id: string;
  question: string;
  type: "shortText" | "single";
  options?: string[];
};

export type FollowupAnswers = {
  raw: Record<string, string>;
};

export type FollowupSeed = {
  source: string;
  createdAt: string;
  summary: unknown;
  rawAnswers: unknown;
};

export type PlanningInput = {
  source: {
    seedSource: string;
    seedCreatedAt: string;
    followupSource: "openai" | "fallback";
    finalizeSource: "openai" | "rule_based_fallback";
  };

  original: {
    summary: unknown;
    rawAnswers: unknown;
    followupRawAnswers: Record<string, string>;
  };

  profile: {
    travelStyle?: string | null;
    pacePreference?: string | null;
    foodImportance?: string | null;
    emotionalTone?: string | null;
  };

  tripContext: {
    destination?: string | null;
    duration?: string | null;
    companions?: string | null;
    groupSize?: string | null;
    budgetLevel?: string | null;
    transportPreference?: string | null;
    lodgingPreference?: string | null;
  };

  constraints: {
    dietary?: string[];
    mobility?: string[];
    schedule?: string[];
  };

  followup: {
    interpretedNeeds: string[];
    specialGoal?: string | null;
    emotionalContext?: string | null;
    planningNotes?: string[];
  };

  planningDirectives: {
    mustIncludeRest: boolean;
    prioritizeFood: boolean;
    avoidLongTransit: boolean;
    keepScheduleLoose: boolean;
    preferEfficientRoute: boolean;
  };
};

export type FollowupQuestionsResponse = {
  source: "openai" | "fallback";
  questions: FollowupQuestion[];
  error?: string;
};

export type FollowupFinalizeResponse = {
  source: "openai" | "rule_based_fallback";
  planningInput: PlanningInput;
  error?: string;
};
