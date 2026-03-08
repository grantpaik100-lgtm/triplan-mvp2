export type SecondarySection = "G" | "A" | "B" | "C" | "D" | "E" | "F" | "H";

export type SingleValueQuestionId =
  | "country"
  | "city"
  | "companionType"
  | "budgetLevel"
  | "firstDayStart"
  | "lastDayEnd"
  | "pace"
  | "chronotype"
  | "restFrequency"
  | "dailyActivityTolerance"
  | "walkTolerance"
  | "transferTolerance"
  | "stayMode"
  | "foodRole"
  | "waitingTolerance"
  | "primaryGoal"
  | "mustStayTogether"
  | "conflictRule";

export type MultiValueQuestionId =
  | "moveStyle"
  | "lodgingPriorities"
  | "foodRestrictions"
  | "mustDoTypes"
  | "avoidTypes";

export type TextQuestionId =
  | "specialCare"
  | "specialContext"
  | "successFeeling";

export type TextListQuestionId =
  | "mustExperiences"
  | "mustFoods";

export type SingleAnswerValue = string;
export type MultiAnswerValue = string[];

export type PlaceItem = {
  name: string;
  reason: string;
  importance: "낮" | "중" | "높";
};

export type SecondaryAnswers = {
  country: SingleAnswerValue;
  countryOther: string;

  city: SingleAnswerValue;
  cityOther: string;

  tripDays: number;

  companionType: SingleAnswerValue;
  companionTypeOther: string;

  partySize: number;

  budgetLevel: SingleAnswerValue;
  budgetLevelOther: string;

  budgetSplit: {
  food: number
  activity: number
  stay: number
  shopping: number
  }

  firstDayStart: SingleAnswerValue;
  firstDayStartOther: string;

  lastDayEnd: SingleAnswerValue;
  lastDayEndOther: string;

  pace: SingleAnswerValue;
  paceOther: string;

  chronotype: SingleAnswerValue;
  chronotypeOther: string;

  restFrequency: SingleAnswerValue;
  restFrequencyOther: string;

  dailyActivityTolerance: SingleAnswerValue;
  dailyActivityToleranceOther: string;

  moveStyle: MultiAnswerValue;
  moveStyleOther: string;

  walkTolerance: SingleAnswerValue;
  walkToleranceOther: string;

  transferTolerance: SingleAnswerValue;
  transferToleranceOther: string;

  stayMode: SingleAnswerValue;
  stayModeOther: string;

  lodgingPriorities: MultiAnswerValue;
  lodgingPrioritiesOther: string;

  foodRole: SingleAnswerValue;
  foodRoleOther: string;

  foodRestrictions: MultiAnswerValue;
  foodRestrictionsOther: string;

  waitingTolerance: SingleAnswerValue;
  waitingToleranceOther: string;

  primaryGoal: SingleAnswerValue;
  primaryGoalOther: string;

  mustDoTypes: MultiAnswerValue;
  mustDoTypesOther: string;

  avoidTypes: MultiAnswerValue;
  avoidTypesOther: string;

  mustPlaces: PlaceItem[];
  mustExperiences: string[];
  mustFoods: string[];

  mustStayTogether: SingleAnswerValue;
  mustStayTogetherOther: string;

  conflictRule: SingleAnswerValue;
  conflictRuleOther: string;

  specialCare: string;
  specialContext: string;
  successFeeling: string;
};

export const secondaryInitialAnswers: SecondaryAnswers = {
  country: "",
  countryOther: "",

  city: "",
  cityOther: "",

  tripDays: 3,

  companionType: "",
  companionTypeOther: "",

  partySize: 1,

  budgetLevel: "",
  budgetLevelOther: "",
  budgetSplit: {
  food: 3,
  activity: 3,
  stay: 3,
  shopping: 1,
  },

  firstDayStart: "",
  firstDayStartOther: "",

  lastDayEnd: "",
  lastDayEndOther: "",

  pace: "",
  paceOther: "",

  chronotype: "",
  chronotypeOther: "",

  restFrequency: "",
  restFrequencyOther: "",

  dailyActivityTolerance: "",
  dailyActivityToleranceOther: "",

  moveStyle: [],
  moveStyleOther: "",

  walkTolerance: "",
  walkToleranceOther: "",

  transferTolerance: "",
  transferToleranceOther: "",

  stayMode: "",
  stayModeOther: "",

  lodgingPriorities: [],
  lodgingPrioritiesOther: "",

  foodRole: "",
  foodRoleOther: "",

  foodRestrictions: [],
  foodRestrictionsOther: "",

  waitingTolerance: "",
  waitingToleranceOther: "",

  primaryGoal: "",
  primaryGoalOther: "",

  mustDoTypes: [],
  mustDoTypesOther: "",

  avoidTypes: [],
  avoidTypesOther: "",

  mustPlaces: [],
  mustExperiences: [],
  mustFoods: [],

  mustStayTogether: "",
  mustStayTogetherOther: "",

  conflictRule: "",
  conflictRuleOther: "",

  specialCare: "",
  specialContext: "",
  successFeeling: "",
};

export function cloneSecondaryInitialAnswers(): SecondaryAnswers {
  return JSON.parse(JSON.stringify(secondaryInitialAnswers)) as SecondaryAnswers;
}
