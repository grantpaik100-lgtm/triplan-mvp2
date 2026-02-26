export type Scores = {
  rest: number;
  schedule: number;
  mood: number;
  strategy: number;
};

export function calculateType(answers: Record<string, number>): keyof Scores {
  const scores: Scores = {
    rest: 0,
    schedule: 0,
    mood: 0,
    strategy: 0,
  };

  // 간단 예시 로직 (나중에 가중치 조정 가능)
  Object.entries(answers).forEach(([id, value]) => {
    if (id === "q1" || id === "q6") scores.rest += value;
    if (id === "q2" || id === "q4") scores.schedule += value;
    if (id === "q3") scores.mood += value;
    if (id === "q5") scores.strategy += value;
  });

  const max = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  return max as keyof Scores;
}
