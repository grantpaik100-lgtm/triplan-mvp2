import type {
  MultiValueQuestionId,
  SecondaryAnswers,
  SecondarySection,
  SingleValueQuestionId,
  TextListQuestionId,
  TextQuestionId,
} from "./secondarySchema";

export type CountryCode = "KR" | "JP";

export type SecondaryQuestionType =
  | "country"
  | "city"
  | "single"
  | "multi"
  | "number"
  | "places"
  | "textList"
  | "textarea";

export type SecondaryQuestionId =
  | SingleValueQuestionId
  | MultiValueQuestionId
  | TextQuestionId
  | TextListQuestionId
  | "tripDays"
  | "partySize"
  | "mustPlaces";

export type SecondaryQuestion = {
  id: SecondaryQuestionId;
  section: SecondarySection;
  title: string;
  help?: string;
  type: SecondaryQuestionType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  maxSelect?: number;
  maxItems?: number;
  showWhen?: (answers: Partial<SecondaryAnswers> & Record<string, any>) => boolean;
};

export const CITY_OPTIONS: Record<CountryCode, string[]> = {
  KR: ["서울", "부산", "제주", "강릉", "경주", "여수", "속초", "인천"],
  JP: ["도쿄", "오사카", "교토", "후쿠오카", "삿포로", "고베", "요코하마", "나가사키"],
};

export function getCityOptions(country?: string): string[] {
  if (country === "KR" || country === "JP") return CITY_OPTIONS[country];
  return [];
}

export const secondaryQuestions: SecondaryQuestion[] = [
  {
    id: "country",
    section: "G",
    title: "어느 나라로 여행 가나요?",
    help: "현재 MVP에서는 한국/일본만 지원한다.",
    type: "country",
    required: true,
  },
  {
    id: "city",
    section: "G",
    title: "어느 도시로 가나요?",
    help: "선택한 국가 기준으로 도시 목록이 바뀐다.",
    type: "city",
    required: true,
  },
  {
    id: "tripDays",
    section: "G",
    title: "여행은 총 며칠인가요?",
    type: "number",
    required: true,
  },
  {
    id: "companionType",
    section: "G",
    title: "누구와 함께 여행하나요?",
    type: "single",
    required: true,
    options: ["혼자", "연인", "친구", "가족", "부모님", "여러 명", "기타"],
  },
  {
    id: "partySize",
    section: "G",
    title: "총 인원은 몇 명인가요?",
    type: "number",
    required: true,
  },
  {
    id: "budgetLevel",
    section: "G",
    title: "이번 여행의 예산 수준은 어느 정도인가요?",
    type: "single",
    required: true,
    options: ["가볍게 아끼는 편", "적당히 균형 있게", "좋은 곳에는 쓰는 편", "꽤 투자해도 괜찮음", "아직 잘 모르겠음", "기타"],
  },

  {
    id: "firstDayStart",
    section: "A",
    title: "첫날 몇 시부터 여행이 가능하나요?",
    type: "single",
    required: true,
    options: ["09시 이전", "09~11시", "11~14시", "14시 이후", "아직 잘 모르겠음", "기타"],
  },
  {
    id: "lastDayEnd",
    section: "A",
    title: "마지막 날 몇 시까지 여행이 가능한가요?",
    type: "single",
    required: true,
    options: ["12시 이전", "12~15시", "15~18시", "18시 이후", "아직 잘 모르겠음", "기타"],
  },
  {
    id: "pace",
    section: "A",
    title: "하루 일정은 어느 정도 밀도가 좋나요?",
    type: "single",
    required: true,
    options: ["여유 있게", "적당히 균형 있게", "많이 담는 편", "잘 모르겠음", "기타"],
  },
  {
    id: "chronotype",
    section: "A",
    title: "여행할 때 어느 시간대가 더 잘 맞나요?",
    type: "single",
    required: true,
    options: ["아침형", "중간", "저녁형", "딱히 상관 없음", "기타"],
  },
  {
    id: "restFrequency",
    section: "A",
    title: "여행 중 카페나 숙소에서 쉬는 시간을 어느 정도 갖고 싶나요?",
    type: "single",
    required: true,
    options: ["거의 필요 없음", "하루 1번 정도", "하루 2번 정도", "자주 쉬는 편이 좋음", "기타"],
  },
  {
    id: "dailyActivityTolerance",
    section: "A",
    title: "하루에 어느 정도 돌아다니는 일정이 가장 잘 맞나요?",
    type: "single",
    required: true,
    options: ["1~2곳만 여유 있게", "3~4곳 정도", "5곳 이상도 괜찮음", "날마다 다름", "기타"],
  },

  {
    id: "foodRole",
    section: "B",
    title: "이번 여행에서 음식은 어떤 위치인가요?",
    type: "single",
    required: true,
    options: ["크게 중요하지 않음", "있으면 즐기고 싶음", "맛집 몇 곳은 꼭 넣고 싶음", "음식이 여행의 핵심임", "기타"],
  },
  {
    id: "foodRestrictions",
    section: "B",
    title: "피하거나 조심해야 할 음식이 있나요?",
    type: "multi",
    required: true,
    options: ["날것", "느끼한 음식", "매운 음식", "해산물", "특정 재료/알레르기", "딱히 없음", "기타"],
    maxSelect: 5,
  },
  {
    id: "waitingTolerance",
    section: "B",
    title: "인기 맛집 대기를 어느 정도까지 괜찮게 생각하나요?",
    type: "single",
    required: true,
    options: ["웨이팅은 피하고 싶음", "15분까지 가능", "30분까지 가능", "1시간까지 가능", "상황에 따라 다름", "기타"],
  },

  {
    id: "moveStyle",
    section: "C",
    title: "어떤 이동 방식이 괜찮나요?",
    type: "multi",
    required: true,
    options: ["도보", "대중교통", "택시", "렌터카", "기타"],
    maxSelect: 3,
  },
  {
    id: "walkTolerance",
    section: "C",
    title: "한 번에 걷는 이동은 어느 정도까지 괜찮나요?",
    type: "single",
    required: true,
    options: ["10분 이내", "10~20분", "20~40분", "40분 이상도 괜찮음", "기타"],
  },
  {
    id: "transferTolerance",
    section: "C",
    title: "장소 사이 이동 시간이 길어지는 건 어느 정도까지 괜찮나요?",
    type: "single",
    required: true,
    options: ["15분 이내", "30분 정도", "1시간 정도", "1시간 이상도 괜찮음", "기타"],
  },

  {
    id: "stayMode",
    section: "D",
    title: "이번 여행에서는 숙소를 어떻게 잡는 게 좋나요?",
    type: "single",
    required: true,
    options: ["한 숙소에 계속 머물고 싶음", "필요하면 옮겨도 괜찮음", "지역이 바뀌면 이동도 괜찮음", "아직 잘 모르겠음", "기타"],
  },
  {
    id: "lodgingPriorities",
    section: "D",
    title: "숙소에서 중요한 요소를 골라주세요",
    type: "multi",
    required: true,
    options: ["위치", "가격", "청결", "조식", "뷰", "욕장/스파", "기타"],
    maxSelect: 3,
  },

  {
    id: "primaryGoal",
    section: "F",
    title: "이번 여행에서 가장 중요하게 챙기고 싶은 것은 무엇인가요?",
    type: "single",
    required: true,
    options: ["편하게 쉬기", "여러 곳 둘러보기", "좋은 분위기와 감정", "동선 효율과 알찬 구성", "음식", "쇼핑", "기타"],
  },
  {
    id: "mustDoTypes",
    section: "F",
    title: "꼭 넣고 싶은 활동/장소 유형을 골라주세요",
    type: "multi",
    required: true,
    options: ["유명 관광지", "자연/풍경", "쇼핑", "카페", "골목/로컬 거리", "전시/박물관", "야경/밤거리", "기타"],
    maxSelect: 3,
  },
  {
    id: "avoidTypes",
    section: "F",
    title: "가능하면 피하고 싶은 활동/장소 유형을 골라주세요",
    type: "multi",
    required: true,
    options: ["유명 관광지", "자연/풍경", "쇼핑", "카페", "골목/로컬 거리", "전시/박물관", "야경/밤거리", "기타"],
    maxSelect: 3,
  },
  {
    id: "mustPlaces",
    section: "F",
    title: "꼭 가고 싶은 장소가 있다면 적어주세요",
    help: "최소 1개는 입력해야 한다.",
    type: "places",
    required: true,
  },
  {
    id: "mustExperiences",
    section: "F",
    title: "꼭 하고 싶은 경험이 있다면 적어주세요",
    type: "textList",
    required: false,
    maxItems: 5,
    placeholder: "예: 온천, 야경 보기",
  },
  {
    id: "mustFoods",
    section: "F",
    title: "꼭 먹고 싶은 음식이 있다면 적어주세요",
    type: "textList",
    required: false,
    maxItems: 5,
    placeholder: "예: 라멘, 스시",
  },

  {
    id: "mustStayTogether",
    section: "E",
    title: "여행 중 대부분 함께 다니는 편이 좋나요?",
    type: "single",
    required: true,
    options: ["대부분 함께", "가끔 나눠서도 괜찮음", "자유롭게 나눠도 괜찮음", "잘 모르겠음", "기타"],
    showWhen: (answers) => answers.companionType !== "혼자",
  },
  {
    id: "conflictRule",
    section: "E",
    title: "의견이 다를 때는 어떤 방식이 가장 좋나요?",
    type: "single",
    required: true,
    options: ["다수결", "가장 힘든 사람 기준", "번갈아 우선하기", "계획 짜는 사람이 정리", "상황마다 대화해서 결정", "기타"],
    showWhen: (answers) => answers.companionType !== "혼자",
  },
  {
    id: "specialCare",
    section: "E",
    title: "일정 짤 때 특히 배려해야 할 사람이 있거나 상황이 있나요?",
    type: "textarea",
    required: false,
    placeholder: "예: 부모님이 오래 걷는 걸 힘들어함 / 아이 낮잠 시간이 필요함",
    showWhen: (answers) => answers.companionType !== "혼자",
  },

  {
    id: "specialContext",
    section: "H",
    title: "이번 여행이 특별한 이유가 있다면 알려주세요",
    type: "textarea",
    required: false,
    placeholder: "예: 생일 여행, 첫 해외여행, 전역 기념",
  },
  {
    id: "successFeeling",
    section: "H",
    title: "이번 여행이 잘 됐다고 느끼려면 어떤 느낌이어야 하나요?",
    type: "textarea",
    required: false,
    placeholder: "예: 안 피곤하고 여유로웠으면 좋겠음 / 후회 없이 알찼으면 좋겠음",
  },
];
