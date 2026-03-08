// secondarySchema.ts

export type SingleAnswerValue = string;

export type PlaceItem = {
  name: string;
  note?: string;
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

  // 🔵 추가된 예산 분배
  budgetSplit: {
    food: number;
    activity: number;
    stay: number;
    shopping: number;
  };

  firstDayStart: SingleAnswerValue;
  firstDayStartOther: string;

  lastDayEnd: SingleAnswerValue;
  lastDayEndOther: string;

  dailyDensity: SingleAnswerValue;
  dailyDensityOther: string;

  paceStyle: SingleAnswerValue;
  paceStyleOther: string;

  restFrequency: SingleAnswerValue;
  restFrequencyOther: string;

  moveStyle: SingleAnswerValue;
  moveStyleOther: string;

  moveTolerance: SingleAnswerValue;
  moveToleranceOther: string;

  foodImportance: SingleAnswerValue;
  foodImportanceOther: string;

  foodRestriction: string[];

  waitingTolerance: SingleAnswerValue;
  waitingToleranceOther: string;

  mustPlaces: PlaceItem[];

  mustExperiences: string;

  mustFoods: string;

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

  // 🔵 예산 분배 기본값
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

  dailyDensity: "",
  dailyDensityOther: "",

  paceStyle: "",
  paceStyleOther: "",

  restFrequency: "",
  restFrequencyOther: "",

  moveStyle: "",
  moveStyleOther: "",

  moveTolerance: "",
  moveToleranceOther: "",

  foodImportance: "",
  foodImportanceOther: "",

  foodRestriction: [],

  waitingTolerance: "",
  waitingToleranceOther: "",

  mustPlaces: [],

  // 🔵 UX 개선 (textList → textarea)
  mustExperiences: "",

  mustFoods: "",

  specialCare: "",

  specialContext: "",

  successFeeling: "",
};

export function cloneSecondaryInitialAnswers(): SecondaryAnswers {
  return JSON.parse(
    JSON.stringify(secondaryInitialAnswers)
  ) as SecondaryAnswers;
}
