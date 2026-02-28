// app/secondary/secondaryQuestions.ts
export type Section = "A" | "B" | "C" | "D" | "E" | "F";

export type SecondaryQuestionType =
  | "segmented"
  | "toggle"
  | "multiChips"
  | "tagInput"
  | "waitingPreset"
  | "rank"
  | "places"
  | "textarea";

export type SecondaryQuestion = {
  id: string;
  section: Section;
  orderInSection: number;
  type: SecondaryQuestionType;
  title: string;
  help?: string;
  options?: string[];
  placeholder?: string;
};

export const secondaryQuestions: SecondaryQuestion[] = [
  // A (리듬/밀도)
  {
    id: "a_rhythm",
    section: "A",
    orderInSection: 1,
    type: "segmented",
    title: "하루 리듬은 어떤 편인가요?",
    help: "출발/첫 일정 시간을 자동으로 맞추는 데 사용돼요.",
    options: ["아침형", "중간", "저녁형"],
  },
  {
    id: "a_density",
    section: "A",
    orderInSection: 2,
    type: "segmented",
    title: "일정 밀도는 어느 쪽이 좋아요?",
    help: "하루에 넣을 ‘핵심 개수’를 결정해요.",
    options: ["느슨", "보통", "빡빡"],
  },

  // B (음식/웨이팅)
  {
    id: "b_allergyTags",
    section: "B",
    orderInSection: 1,
    type: "tagInput",
    title: "못 먹는 음식/알러지가 있나요?",
    help: "필터링 + 대체 메뉴 추천에 쓰여요.",
    placeholder: "예: 유제품, 갑각류",
  },
  {
    id: "b_waitingPreset",
    section: "B",
    orderInSection: 2,
    type: "waitingPreset",
    title: "맛집 웨이팅, 최대 몇 분까지 괜찮나요?",
    help: "웨이팅 긴 식당을 자동 배제/완화해요.",
  },

  // C (이동)
  {
    id: "c_transportPrefs",
    section: "C",
    orderInSection: 1,
    type: "multiChips",
    title: "이동 수단 선호를 골라주세요 (복수 가능)",
    help: "동선 계산에서 가중치로 반영돼요.",
    options: ["도보", "대중교통", "택시", "렌트"],
  },
  {
    id: "c_mobilityConstraint",
    section: "C",
    orderInSection: 2,
    type: "toggle",
    title: "유모차/휠체어 등 이동 제약이 있나요?",
    help: "엘리베이터/완만한 길/휴식 빈도 우선순위에 반영돼요.",
    options: ["없음", "있음"],
  },

  // D (숙소)
  {
    id: "d_lodgingStrategy",
    section: "D",
    orderInSection: 1,
    type: "segmented",
    title: "숙소는 1곳 고정이 좋아요, 이동해도 괜찮아요?",
    help: "체크인/체크아웃 비용(시간·피로)을 모델링해요.",
    options: ["1곳 고정", "2곳까지", "상관없음"],
  },
  {
    id: "d_lodgingRank",
    section: "D",
    orderInSection: 2,
    type: "rank",
    title: "숙소 우선순위를 정렬해 주세요",
    help: "추천 후보의 점수 계산에 들어가요.",
    options: ["위치", "가격", "청결", "조식", "욕장/샤워"],
  },

  // E (동행/규칙)
  {
    id: "e_groupMode",
    section: "E",
    orderInSection: 1,
    type: "segmented",
    title: "이번 여행은 혼자/여럿 중 어느 쪽인가요?",
    help: "여럿이면 ‘충돌 해결’ 로직이 활성화돼요.",
    options: ["혼자", "여럿"],
  },
  {
    id: "e_conflictRule",
    section: "E",
    orderInSection: 2,
    type: "segmented",
    title: "충돌 해결 규칙을 골라주세요",
    help: "일정 생성 시 ‘누구 기준’을 결정해요.",
    options: ["다수결", "최약자 우선", "번갈아"],
  },

  // F (장소/이유)
  {
    id: "f_places",
    section: "F",
    orderInSection: 1,
    type: "places",
    title: "꼭 가고 싶은 장소를 1개 이상 적어주세요",
    help: "장소는 ‘제약 조건’이라서 결과 품질이 크게 올라가요.",
  },
  {
    id: "f_placeReasonOneLine",
    section: "F",
    orderInSection: 2,
    type: "textarea",
    title: "그중 가장 중요한 이유를 한 줄로 적어주세요",
    help: "요약 화면에서 ‘여행의 핵’으로 표시돼요.",
    placeholder: "예: 부모님이 꼭 보고 싶어 하셔서 / 이번 여행의 목표라서",
  },
];
