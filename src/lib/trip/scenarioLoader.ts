/**
 * TriPlan V3
 * Current Role:
 * - dev scenario JSON을 불러와 engine 테스트용 canonical input으로 변환하는 loader file이다.
 *
 * Target Role:
 * - survey를 반복하지 않고 planningInput/userVector를 재사용하는 공식 dev input adapter가 되어야 한다.
 *
 * Chain:
 * - engine
 *
 * Inputs:
 * - scenario name
 *
 * Outputs:
 * - primaryResult
 * - planningInput
 *
 * Called From:
 * - app/dev/scenario/page.tsx
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
 * - 사용자용 설문 체인과 엔진 개발용 scenario 체인을 분리하기 위한 파일이다.
 */
import denseFriends3d from "./scenarios/seoul_friends_dense_3d.json";
import coupleRomantic3d from "./scenarios/seoul_couple_romantic_3d.json";
import familyLight3d from "./scenarios/seoul_family_light_3d.json";
import type { PlanningInput, UserVector } from "./types";

export type DevScenario = {
  name: string;
  primaryResult: {
    userVector: Partial<UserVector>;
  };
  planningInput: PlanningInput;
};

const SCENARIOS: Record<string, DevScenario> = {
  [denseFriends3d.name]: denseFriends3d as DevScenario,
  [coupleRomantic3d.name]: coupleRomantic3d as DevScenario,
  [familyLight3d.name]: familyLight3d as DevScenario,
};

export function getScenarioNames(): string[] {
  return Object.keys(SCENARIOS);
}

export function loadScenario(name: string): DevScenario {
  const scenario = SCENARIOS[name];

  if (!scenario) {
    throw new Error(`Unknown scenario: ${name}`);
  }

  return scenario;
}
