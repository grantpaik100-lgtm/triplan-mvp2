export type FollowupSeed = {
  source: string;
  createdAt: string;
  summary: unknown;
  rawAnswers: unknown;
};

export type ChatMessage = {
  role: "assistant" | "user";
  content: string;
};

export type ExtractedSlots = {
  pacePreference?: string | null;
  restPriority?: string | null;
  foodImportance?: string | null;
  waitingTolerance?: string | null;
  mobilityConstraint?: string | null;
  transportPreference?: string | null;
  specialGoal?: string | null;
  emotionalContext?: string | null;
};

export type PlanningInput = {
  source: {
    seedSource: string;
    seedCreatedAt: string;
    finalizeSource: "openai" | "rule_based_fallback";
  };
  raw: {
    surveySummary: unknown;
    surveyRawAnswers: unknown;
    followupMessages: ChatMessage[];
    extractedSlots: ExtractedSlots;
  };
  hardConstraints: {
    mobilityLimit: boolean;
    dietaryRestrictions: string[];
    maxTransitPreference: string | null;
  };
  softPreferences: {
    pace: string | null;
    foodFocus: string | null;
    restFocus: string | null;
    routeEfficiency: string | null;
  };
  context: {
    specialGoal: string | null;
    emotionalContext: string | null;
    companionDynamic: string | null;
  };
};

export type StartChatResponse = {
  assistantMessage: string;
  extractedSlots: ExtractedSlots;
  missingSlots: string[];
  turnCount: number;
};

export type TurnChatResponse = {
  assistantMessage: string;
  extractedSlots: ExtractedSlots;
  missingSlots: string[];
  turnCount: number;
  shouldFinalize: boolean;
};

export type FinalizeChatResponse = {
  source: "openai" | "rule_based_fallback";
  planningInput: PlanningInput;
  error?: string;
};
