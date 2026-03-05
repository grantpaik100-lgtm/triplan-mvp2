// app/secondary/secondaryQuestions.ts
export type SecondarySection = "G" | "A" | "B" | "C" | "D" | "E" | "F";

export type SecondaryQuestion = {
  id: string;
  section: SecondarySection;
  orderInSection: number;
  title: string;
  help?: string;
  type:
    | "segmented"
    | "waitingPreset"
    | "tagInput"
    | "rankAssign"
    | "places"
    | "numberPair"
    | "numberOne"
    | "textarea";
  options?: string[];
  placeholder?: string;
};

export const secondaryQuestions: SecondaryQuestion[] = [
  // G 기본 정보
  { id: "g_tripNights", section: "G", orderInSection: 1, title: "여행 기간(박/일)", help: "예: 2박 3일", type: "numberPair" },
  { id: "g_groupSize", section: "G", orderInSection: 2, title: "인원 수", help: "예: 1~4+", type: "numberOne" },
  { id: "g_companionType", section: "G", orderInSection: 3, title: "동행 유형", type: "segmented", options: ["혼자", "친구", "가족", "연인", "기타"] },

  // A
  { id: "a_rhythm", section: "A", orderInSection: 1, title: "활동 선호 시간대", help: "주로 컨디션이 좋은 시간대를 고른다.", type: "segmented", options: ["새벽", "아침", "오후", "저녁"] },
  { id: "a_density", section: "A", orderInSection: 2, title: "일정 밀도", help: "예: 느슨(하루 2~3) / 보통(4~5) / 빡빡(5~6)", type: "segmented", options: ["느슨", "보통", "빡빡"] },

  // B
  { id: "b_waitingPreset", section: "B", orderInSection: 1, title: "대기 허용 상한", help: "예: 20분 정도까지는 허용", type: "waitingPreset", options: ["짧게(10~15)", "보통(20~30)", "여유(40+)", "직접"] },
  { id: "b_allergyTags", section: "B", orderInSection: 2, title: "알레르기(있다면)", help: "입력 후 추가. 없으면 비워둔다.", type: "tagInput", placeholder: "예: 땅콩, 갑각류" },
  { id: "b_avoidTags", section: "B", orderInSection: 3, title: "회피 음식/요소(있다면)", help: "입력 후 추가. 없으면 비워둔다.", type: "tagInput", placeholder: "예: 내장, 느끼한 고기" },

  // C
  { id: "c_walkCap", section: "C", orderInSection: 1, title: "도보 이동 허용", help: "대략적인 체력 기준을 고른다.", type: "segmented", options: ["짧게", "보통", "길게"] },
  { id: "c_stairs", section: "C", orderInSection: 2, title: "계단/경사", help: "동선 후보 필터링에 사용된다.", type: "segmented", options: ["가능", "가급적 피함"] },
  { id: "c_nightMove", section: "C", orderInSection: 3, title: "야간 이동", help: "늦은 시간 이동을 포함해도 되는지.", type: "segmented", options: ["가능", "피함"] },

  // D
  { id: "d_lodgingStrategy", section: "D", orderInSection: 1, title: "숙소 우선 전략", help: "숙소 선택의 1차 기준.", type: "segmented", options: ["접근성", "가성비", "분위기", "휴식"] },
  { id: "d_lodgingPriority", section: "D", orderInSection: 2, title: "숙소 우선순위(1~5)", help: "모바일: 각 항목에 1~5순위를 지정(중복 불가).", type: "rankAssign", options: ["역/대중교통", "조용함", "가격", "침대/휴식", "주변 식당/편의"] },

  // E
  { id: "e_groupMode", section: "E", orderInSection: 1, title: "여행 형태", help: "여럿이면 ‘의견 충돌 처리’가 추가된다.", type: "segmented", options: ["혼자", "여럿"] },
  { id: "e_conflictRule", section: "E", orderInSection: 2, title: "의견 충돌 처리 방식", help: "동행자 선호가 다를 때 일정을 결정하는 정책.", type: "segmented", options: ["균형(번갈아)", "다수결", "대표 1인", "부분 분리"] },

  // F
  { id: "f_places", section: "F", orderInSection: 1, title: "꼭 가고 싶은 장소", help: "장소 + 이유 + 중요도를 입력한다. ‘지도에서 찾기’로 검색 가능.", type: "places" },
  { id: "f_placeReasonOneLine", section: "F", orderInSection: 2, title: "추가로 남길 한 줄(선택)", help: "예: 이번 여행의 핵심은 ‘야경 + 로컬 음식’", type: "textarea", placeholder: "선택 입력" },
];
