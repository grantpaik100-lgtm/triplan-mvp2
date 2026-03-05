// app/secondary/secondarySchema.ts

export type SecondaryAnswers = {
  // G: 기본 정보 (일정 생성에 필요한 "컨텍스트")
  g_destinationCity: string;         // 도시/지역 텍스트 입력 (필수)
  g_destinationMapUrl?: string;      // 지도 링크(선택) - 공유 링크 붙여넣기
  g_tripNights: number;              // n박
  g_tripDays: number;                // n일
  g_groupSize: number;               // 인원
  g_companionType: "혼자" | "친구" | "가족" | "연인" | "기타";

  // A: 시간/리듬
  a_rhythm: "새벽" | "아침" | "오후" | "저녁";
  a_density: "느슨" | "보통" | "빡빡";

  // B: 음식 리스크
  b_waitingPreset: "짧게(10~15)" | "보통(20~30)" | "여유(40+)" | "직접";
  b_waitingCustomMinutes?: number;
  b_allergyTags: string[];
  b_avoidTags: string[];

  // C: 이동 제약
  c_walkCap: "짧게" | "보통" | "길게";
  c_stairs: "가능" | "가급적 피함";
  c_nightMove: "가능" | "피함";

  // D: 숙소 전략
  d_lodgingStrategy: "접근성" | "가성비" | "분위기" | "휴식";
  d_lodgingPriority: string[]; // 1~5순위(정렬된 배열)

  // E: 동행 조율
  e_groupMode: "혼자" | "여럿";
  e_conflictRule?: "균형(번갈아)" | "다수결" | "대표 1인" | "부분 분리";

  // F: 핵심 장소
  f_places: Array<{ name: string; reason: string; importance: "낮" | "중" | "높" }>;
  f_placeReasonOneLine: string;
};

export const secondarySchema = {} as const;
