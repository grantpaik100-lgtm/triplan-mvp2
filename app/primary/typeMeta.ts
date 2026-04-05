/**
 * TriPlan V3
 * Current Role:
 * - Primary result type별 표시 메타데이터(텍스트/이미지/설명 등)를 제공하는 reference file이다.
 *
 * Target Role:
 * - PrimaryResultView가 참조하는 공식 presentation metadata file로 유지되어야 한다.
 *
 * Chain:
 * - primary
 *
 * Inputs:
 * - type key
 *
 * Outputs:
 * - 해당 type의 표시 메타데이터
 *
 * Called From:
 * - app/primary/PrimaryResultView.tsx
 *
 * Side Effects:
 * - 없음
 *
 * Current Status:
 * - canonical
 *
 * Decision:
 * - keep
 *
 * Move Target:
 * - 없음
 *
 * Notes:
 * - UI 메타데이터 성격이지만 primary result 설명 계층에서 필요하다.
 */
export const typeMeta = {
  rest: {
    name: "휴식 설계자",
    slogan: "쉼의 흐름을 설계하는 여행자",
    description:
      "당신은 여행에서의 여유와 안정감을 중요하게 생각합니다. 휴식과 회복의 균형을 잘 설계하는 타입입니다.",
    bullets: [
      "하루 일정에 여유가 있을 때 여행이 가장 즐겁습니다.",
      "과도한 이동이나 일정 밀도는 만족도를 낮춥니다.",
      ]
    
  },
  schedule: {
    name: "스케줄 메이커",
    slogan: "동선을 전략적으로 설계하는 여행자",
    description:
      "당신은 효율과 계획을 중시합니다. 여행의 흐름을 논리적으로 조직하는 타입입니다.",
    bullets: [
      "동선과 시간이 정리되어 있으면 마음이 안정됩니다.",
      "이동이나 대기가 길어지면 여행의 만족도가 빠르게 떨어집니다.",
      ]
  },
  mood: {
    name: "무드 컬렉터",
    slogan: "감성을 수집하는 여행자",
    description:
      "당신은 분위기와 순간의 감정을 중요하게 생각합니다. 감성 중심의 경험을 추구합니다.",
    bullets: [
      "공간의 분위기와 감성이 기억에 오래 남습니다.",
      "효율보다 느낌이 더 중요한 순간이 많습니다.",
      ]
  },
  strategy: {
    name: "전략 탐험가",
    slogan: "도전을 즐기는 개척자",
    description:
      "당신은 새로운 경험과 모험을 즐깁니다. 도전적이고 역동적인 여행을 선호합니다.",
     bullets: [
      "핵심 목적이 분명할 때 여행이 가장 만족스럽습니다.",
      "시간 대비 효율을 자연스럽게 계산하는 편입니다.",
       ]
  },
};
