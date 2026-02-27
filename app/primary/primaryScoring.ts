export type Scores = {
  rest: number;
  schedule: number;
  mood: number;
  strategy: number;
};

export type PrimaryType = "rest" | "schedule" | "mood" | "strategy";

export function calculateType(answers: Record<string, number>): PrimaryType {
  // v1 score buckets
  const score = {
    Relaxation: 0,
    Activity: 0,
    RecoveryNeed: 0,
    Novelty: 0,
    Culture: 0,
    Food: 0,
    Mood: 0,
    MovePain: 0,
    QueuePain: 0,
    WaitAvoid: 0,
    Structure: 0,
    SpontaneityStress: 0,
    BudgetImportant: 0,
    PremiumOk: 0,
  };

  const v = (id: string) => Number(answers[id] ?? 4); // 기본값 4(중립)

  // 설문완성본v1.html의 questions.apply 그대로 반영
  score.Relaxation += v("q1");
  score.Activity += v("q2");
  score.RecoveryNeed += v("q3"); score.Relaxation += v("q3") * 0.6;

  score.Novelty += v("q4");
  score.Culture += v("q5"); score.Novelty += v("q5") * 0.4;

  score.Food += v("q6");
  score.Mood += v("q7");

  score.MovePain += v("q8");
  score.QueuePain += v("q9");
  score.WaitAvoid += v("q10");

  score.Structure += v("q11");
  score.SpontaneityStress += v("q12"); score.Structure += v("q12") * 0.6;

  score.BudgetImportant += v("q13");
  score.PremiumOk += v("q14");

  const norm = (x: number, max: number) => Math.max(0, Math.min(1, x / max));

  const moveTol = 1 - norm(score.MovePain, 7 * 1);
  const queueTol = 1 - norm(score.QueuePain, 7 * 1);
  const waitTol = 1 - norm(score.WaitAvoid, 7 * 1);

  const efficiency =
    1 - ((1 - moveTol) * 0.4 + (1 - queueTol) * 0.35 + (1 - waitTol) * 0.25);

  const mood = norm(score.Mood, 7 * 1);
  const structure = norm(score.Structure, 7 * 1 + 7 * 0.6);
  const exploration = norm(score.Novelty, 7 * 1 + 7 * 0.4);

  // v1 decideType: (efficiency vs mood) x (structure vs exploration)
  const effSide = efficiency >= mood;
  const structSide = structure >= exploration;

  if (effSide && structSide) return "schedule";  // 스케줄 메이커
  if (effSide && !structSide) return "strategy"; // 전략 탐험가
  if (!effSide && !structSide) return "mood";    // 무드 컬렉터
  return "rest";                                 // 휴식 설계자
}
