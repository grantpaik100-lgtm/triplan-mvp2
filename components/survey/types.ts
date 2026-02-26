export type Gender = "남성" | "여성" | "";

export type Profile = {
  nickname: string;
  gender: Gender;
};

export type PrimaryScoreRaw = Record<string, number>;
export type PrimaryScoreNorm = Record<string, number>;

export type PrimaryResult = {
  profile: Profile;
  answers: number[]; // 1..7
  scoreRaw: PrimaryScoreRaw;
  scoreNorm: PrimaryScoreNorm;
  travelerType: "스케줄 메이커" | "전략 탐험가" | "무드 컬렉터" | "휴식 설계자";
};

export type TripForm = {
  city: string;
  nights: string;
  days: string;
  companion: "솔로" | "친구" | "연인" | "가족" | "";
  withChild: "예" | "아니오" | "";
  childAge: "미취학" | "초등" | "중등+" | "";
  goal: string;  // 1순위 목표
  avoid: string; // 1순위 회피
  activityTolerance: "가볍게" | "보통" | "적극적" | "강행군" | "";
  maxWait: "10" | "20" | "40" | "60" | "상관없음" | "";
  density: "여유" | "보통" | "빡빡" | "";
  transportMulti: {
    walk: boolean;
    transit: boolean;
    taxi: boolean;
    rent: boolean;
  };
  transportMain: "도보" | "대중교통" | "택시" | "렌트" | "";
  mobilityLimits: {
    stroller: boolean;
    walkingIssue: boolean;
    heavyLuggage: boolean;
    none: boolean;
  };
  stayStyle: "1곳 고정" | "이동 허용" | "";
  stayPriority: string[]; // 최대 2
};

export type Anchors = {
  must: string[];   // max 3
  should: string[]; // max 3
  avoid: string[];  // optional
};

export type LlmAssistForm = {
  mood: string[]; // max 2
  specialMeaning: string;
  successMoments: string;
  worries: string[]; // checkbox
  worriesEtc: string;
  conflictRule: "최약자 기준" | "다수결" | "번갈아" | "즉흥 협의" | "";
  hardNo: string[]; // 1~2
};

export type LlmExtractionM = {
  context_tags: string[];
  success_moments: string[];
  risks: string[];
  hard_constraints: {
    no_early_morning?: boolean;
    max_wait_minutes?: number;
    no_long_transfer?: boolean;
  };
  soft_preferences: {
    mood?: string[];
    pace?: "light" | "moderate" | "dense";
    focus?: string[];
  };
  user_summary_sentence: string;
};

export type DesignSpec = {
  primary: PrimaryResult;
  trip: TripForm;
  anchors: Anchors;
  assist: LlmAssistForm;
  extraction: LlmExtractionM;
};
