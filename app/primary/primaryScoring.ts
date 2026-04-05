/**
 * TriPlan V3
 * Current Role:
 * - Primary survey 응답을 User Model vector / type 결과로 변환하는 scoring 로직 파일이다.
 *
 * Target Role:
 * - Primary response -> user preference representation 변환의 공식 scoring module로 유지되어야 한다.
 *
 * Chain:
 * - primary
 *
 * Inputs:
 * - primary survey answers
 *
 * Outputs:
 * - primaryResult
 * - userVector
 * - type / scoring result
 *
 * Called From:
 * - app/flows/PrimaryMiniApp.tsx
 * - Primary result rendering chain
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
 * - User Model의 stable layer로 연결되는 핵심 파일이다.
 * - 삭제 금지.
 */
export type Scores = {
  rest: number;
  schedule: number;
  mood: number;
  strategy: number;
};

export type PrimaryType = "rest" | "schedule" | "mood" | "strategy";

export type PrimaryUserVector = {
  food: number;
  culture: number;
  nature: number;
  shopping: number;
  entertainment: number;

  quiet: number;
  romantic: number;
  local: number;
  touristy: number;
  luxury: number;
  hipster: number;
  traditional: number;

  walkIntensity: number;
  crowdLevel: number;
  activityIntensity: number;
  cost: number;
};

export type PrimaryResultPayload = {
  answers: Record<string, number>;
  type: PrimaryType;
  scores: Scores;
  userVector: PrimaryUserVector;
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function normalize7(value: number) {
  return clamp01((value - 1) / 6);
}

export function calculateScores(answers: Record<string, number>): Scores {
  const v = (id: string) => Number(answers[id] ?? 4);

  const relaxation = normalize7((v("q1") + v("q3")) / 2);
  const novelty = normalize7((v("q4") + v("q5")) / 2);
  const food = normalize7(v("q6"));
  const mood = normalize7(v("q7"));
  const movePain = normalize7(v("q8"));
  const queuePain = normalize7(v("q9"));
  const waitPain = normalize7(v("q10"));
  const structure = normalize7((v("q11") + v("q12")) / 2);
  const budgetImportant = normalize7(v("q13"));
  const premiumOk = normalize7(v("q14"));

  const efficiency = clamp01(
    1 - (movePain * 0.4 + queuePain * 0.35 + waitPain * 0.25)
  );

  const exploration = novelty;

  return {
    rest: clamp01(relaxation * 0.55 + mood * 0.25 + (1 - movePain) * 0.2),
    schedule: clamp01(efficiency * 0.55 + structure * 0.35 + (1 - novelty) * 0.1),
    mood: clamp01(mood * 0.55 + food * 0.15 + relaxation * 0.15 + (1 - structure) * 0.15),
    strategy: clamp01(exploration * 0.45 + efficiency * 0.2 + structure * 0.15 + premiumOk * 0.2),
  };
}

export function calculateType(answers: Record<string, number>): PrimaryType {
  const scores = calculateScores(answers);

  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return sorted[0][0] as PrimaryType;
}

export function buildPrimaryUserVector(
  answers: Record<string, number>,
  type?: PrimaryType
): PrimaryUserVector {
  const resolvedType = type ?? calculateType(answers);

  const v = (id: string) => Number(answers[id] ?? 4);

  const relaxation = normalize7((v("q1") + v("q3")) / 2);
  const novelty = normalize7((v("q4") + v("q5")) / 2);
  const food = normalize7(v("q6"));
  const mood = normalize7(v("q7"));
  const movePain = normalize7(v("q8"));
  const queuePain = normalize7(v("q9"));
  const waitPain = normalize7(v("q10"));
  const structure = normalize7((v("q11") + v("q12")) / 2);
  const budgetImportant = normalize7(v("q13"));
  const premiumOk = normalize7(v("q14"));

  const efficiency = clamp01(
    1 - (movePain * 0.4 + queuePain * 0.35 + waitPain * 0.25)
  );

  const typeBoost =
    resolvedType === "rest"
      ? { quiet: 0.15, nature: 0.12, activityIntensity: -0.08 }
      : resolvedType === "schedule"
      ? { local: 0.05, touristy: 0.08, activityIntensity: 0.05 }
      : resolvedType === "mood"
      ? { romantic: 0.15, hipster: 0.12, touristy: -0.04 }
      : { local: 0.12, culture: 0.08, walkIntensity: 0.08 };

  return {
    food: clamp01(food * 0.7 + mood * 0.1),
    culture: clamp01(novelty * 0.45 + structure * 0.1 + (typeBoost.culture ?? 0)),
    nature: clamp01(relaxation * 0.55 + (typeBoost.nature ?? 0)),
    shopping: clamp01((1 - budgetImportant) * 0.15 + premiumOk * 0.2),
    entertainment: clamp01(mood * 0.35 + novelty * 0.25),

    quiet: clamp01(relaxation * 0.55 + (typeBoost.quiet ?? 0)),
    romantic: clamp01(mood * 0.5 + (typeBoost.romantic ?? 0)),
    local: clamp01(novelty * 0.35 + (typeBoost.local ?? 0)),
    touristy: clamp01((1 - novelty) * 0.15 + (typeBoost.touristy ?? 0)),
    luxury: clamp01(premiumOk * 0.55),
    hipster: clamp01(mood * 0.25 + novelty * 0.25 + (typeBoost.hipster ?? 0)),
    traditional: clamp01(structure * 0.25 + novelty * 0.2),

    walkIntensity: clamp01((1 - movePain) * 0.45 + novelty * 0.2 + (typeBoost.walkIntensity ?? 0)),
    crowdLevel: clamp01((1 - queuePain) * 0.35 + (1 - waitPain) * 0.2),
    activityIntensity: clamp01((1 - relaxation) * 0.2 + novelty * 0.25 + (typeBoost.activityIntensity ?? 0)),
    cost: clamp01((1 - budgetImportant) * 0.45 + premiumOk * 0.35),
  };
}

export function buildPrimaryResultPayload(
  answers: Record<string, number>
): PrimaryResultPayload {
  const type = calculateType(answers);
  const scores = calculateScores(answers);
  const userVector = buildPrimaryUserVector(answers, type);

  return {
    answers,
    type,
    scores,
    userVector,
  };
}
