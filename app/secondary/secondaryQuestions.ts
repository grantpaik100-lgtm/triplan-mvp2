// secondaryQuestions.ts

import { PlaceItem } from "./secondarySchema";

export type SecondaryQuestionType =
  | "country"
  | "city"
  | "single"
  | "multi"
  | "number"
  | "places"
  | "textarea"
  | "budgetSplit";

export type SecondarySection =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H";

export type SecondaryQuestion = {
  id: string;
  type: SecondaryQuestionType;

  section: SecondarySection;

  title: string;
  help?: string;

  options?: { value: string; label: string }[];

  placeholder?: string;

  required?: boolean;

  maxSelect?: number;
};

export const secondaryQuestions: SecondaryQuestion[] = [
  {
    id: "country",
    type: "country",
    section: "A",
    title: "어느 나라로 여행 가시나요?",
    required: true,
  },

  {
    id: "city",
    type: "city",
    section: "A",
    title: "도시는 어디인가요?",
    required: true,
  },

  {
    id: "tripDays",
    type: "number",
    section: "A",
    title: "여행 기간은 며칠인가요?",
  },

  {
    id: "companionType",
    type: "single",
    section: "B",
    title: "누구와 여행하시나요?",
    options: [
      { value: "solo", label: "혼자" },
      { value: "friends", label: "친구" },
      { value: "couple", label: "연인" },
      { value: "family", label: "가족" },
    ],
  },

  {
    id: "partySize",
    type: "number",
    section: "B",
    title: "총 인원은 몇 명인가요?",
  },

  {
    id: "budgetLevel",
    type: "single",
    section: "G",
    title: "전체 예산 수준은 어느 정도인가요?",
    options: [
      { value: "low", label: "절약 여행" },
      { value: "mid", label: "적당히 여유" },
      { value: "high", label: "비용보다 경험" },
    ],
  },

  // 🔵 새로 추가된 질문
  {
    id: "budgetSplit",
    type: "budgetSplit",
    section: "G",
    title: "예산을 어디에 더 쓰고 싶나요?",
    help: "총 10점을 나눠 주세요",
  },

  {
    id: "firstDayStart",
    type: "single",
    section: "C",
    title: "첫날 여행은 언제 시작하나요?",
    options: [
      { value: "morning", label: "아침" },
      { value: "noon", label: "점심 이후" },
      { value: "evening", label: "저녁" },
    ],
  },

  {
    id: "lastDayEnd",
    type: "single",
    section: "C",
    title: "마지막 날은 언제까지 여행 가능한가요?",
    options: [
      { value: "morning", label: "아침까지만" },
      { value: "noon", label: "점심까지" },
      { value: "evening", label: "저녁까지" },
    ],
  },

  {
    id: "dailyDensity",
    type: "single",
    section: "D",
    title: "하루 일정 밀도는 어떤가요?",
    options: [
      { value: "light", label: "여유롭게" },
      { value: "medium", label: "보통" },
      { value: "dense", label: "꽉 채우기" },
    ],
  },

  {
    id: "moveStyle",
    type: "single",
    section: "E",
    title: "이동 방식은 어떤 걸 선호하나요?",
    options: [
      { value: "walk", label: "도보 위주" },
      { value: "transit", label: "대중교통" },
      { value: "taxi", label: "택시" },
      { value: "mixed", label: "상황에 따라" },
    ],
  },

  {
    id: "moveTolerance",
    type: "single",
    section: "E",
    title: "한 번 이동할 때 어느 정도까지 괜찮나요?",
    options: [
      { value: "short", label: "20분 이내" },
      { value: "medium", label: "40분 이내" },
      { value: "long", label: "1시간도 가능" },
    ],
  },

  {
    id: "foodImportance",
    type: "single",
    section: "F",
    title: "음식은 여행에서 얼마나 중요한가요?",
    options: [
      { value: "low", label: "보통" },
      { value: "mid", label: "중요" },
      { value: "high", label: "매우 중요" },
    ],
  },

  {
    id: "waitingTolerance",
    type: "single",
    section: "F",
    title: "맛집 웨이팅은 어느 정도까지 괜찮나요?",
    options: [
      { value: "none", label: "기다리기 싫음" },
      { value: "short", label: "10~20분" },
      { value: "long", label: "1시간도 가능" },
    ],
  },

  {
    id: "mustPlaces",
    type: "places",
    section: "H",
    title: "꼭 가고 싶은 장소가 있다면 적어주세요",
  },

  // 🔵 UX 수정 (textList → textarea)

  {
    id: "mustExperiences",
    type: "textarea",
    section: "H",
    title: "꼭 하고 싶은 경험이 있다면 적어주세요",
    placeholder: "예: 온천, 야경 보기, 자전거 타기",
  },

  {
    id: "mustFoods",
    type: "textarea",
    section: "H",
    title: "꼭 먹고 싶은 음식이 있다면 적어주세요",
    placeholder: "예: 라멘, 스시, 오코노미야키",
  },

  {
    id: "specialCare",
    type: "textarea",
    section: "H",
    title: "여행 설계 시 고려해야 할 점이 있다면 적어주세요",
  },

  {
    id: "specialContext",
    type: "textarea",
    section: "H",
    title: "이번 여행에 특별한 의미가 있나요?",
  },

  {
    id: "successFeeling",
    type: "textarea",
    section: "H",
    title: "이 여행이 잘 되었다고 느끼려면 어떤 느낌이어야 할까요?",
  },
];
