import { PrimaryResult, Profile } from "./types";

type Score = {
  Relaxation: number;
  Activity: number;
  RecoveryNeed: number;
  Novelty: number;
  Culture: number;
  Food: number;
  Mood: number;
  MovePain: number;
  QueuePain: number;
  WaitAvoid: number;
  Structure: number;
  SpontaneityStress: number;
  BudgetImportant: number;
  PremiumOk: number;
};

export type Question = {
  domain: "Energy" | "Exploration" | "Experience" | "Efficiency" | "Structure" | "Cost";
  text: string;
  help?: string;
  apply: (v: number, score: Score) => void;
};

export const chapterLabel: Record<string, string> = {
  Energy: "체력과 리듬",
  Exploration: "새로움과 로컬",
  Experience: "음식과 분위기",
  Efficiency: "이동과 대기",
  Structure: "계획과 즉흥",
  Cost: "돈과 만족",
};

export function initScore(): Score {
  return {
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
}

export const questions: Question[] = [
  // Energy
  { domain:"Energy", text:"일정이 빡빡하면, 나는 금방 지친다.", apply:(v,s)=>{ s.Relaxation += v; } },
  { domain:"Energy", text:"하루에 여러 곳을 돌아다녀도, 나는 에너지가 쉽게 떨어지지 않는다.", apply:(v,s)=>{ s.Activity += v; } },
  { domain:"Energy", text:"여행 중 쉬는 시간이 없으면, 컨디션이 눈에 띄게 떨어진다.", apply:(v,s)=>{ s.RecoveryNeed += v; s.Relaxation += v*0.6; } },

  // Exploration
  { domain:"Exploration", text:"사람들이 많이 가는 곳보다, 덜 알려진 장소를 발견할 때 더 즐겁다.", apply:(v,s)=>{ s.Novelty += v; } },
  { domain:"Exploration", text:"익숙하지 않은 문화나 분위기를 마주하면, 흥미가 더 생긴다.", apply:(v,s)=>{ s.Culture += v; s.Novelty += v*0.4; } },

  // Experience
  { domain:"Experience", text:"음식이 내 입맛에 맞지 않으면, 여행이 힘들게 느껴진다.", apply:(v,s)=>{ s.Food += v; } },
  { domain:"Experience", text:"유명한 명소보다, 그 공간의 분위기가 더 기억에 남는다.", apply:(v,s)=>{ s.Mood += v; } },

  // Efficiency
  { domain:"Efficiency", text:"이동 시간이 길어지면, 여행의 즐거움이 줄어든다.", apply:(v,s)=>{ s.MovePain += v; } },
  { domain:"Efficiency", text:"줄을 오래 서야 하면, 만족도가 떨어진다.", apply:(v,s)=>{ s.QueuePain += v; } },
  { domain:"Efficiency", text:"대기 시간이 길어질 것 같으면, 다른 선택지를 찾는 편이다.", apply:(v,s)=>{ s.WaitAvoid += v; } },

  // Structure
  { domain:"Structure", text:"일정이 어느 정도 정해져 있지 않으면, 마음이 불편해진다.", apply:(v,s)=>{ s.Structure += v; } },
  { domain:"Structure", text:"즉흥적으로 계속 움직여야 하면, 스트레스를 받는다.", apply:(v,s)=>{ s.SpontaneityStress += v; s.Structure += v*0.6; } },

  // Cost
  { domain:"Cost", text:"여행 중 지출이 예상보다 커지면, 계속 신경이 쓰인다.", apply:(v,s)=>{ s.BudgetImportant += v; } },
  { domain:"Cost", text:"비용이 조금 더 들더라도 만족도가 높다면, 그 선택이 아깝지 않다.", apply:(v,s)=>{ s.PremiumOk += v; } },
];

function norm(x:number, max:number){
  if(max <= 0) return 0;
  const v = x / max;
  return Math.max(0, Math.min(1, v));
}

function decideType({efficiency, mood, structure, exploration}:{efficiency:number; mood:number; structure:number; exploration:number;}){
  const effSide = (efficiency >= mood);
  const structSide = (structure >= exploration);

  if(effSide && structSide) return "스케줄 메이커" as const;
  if(effSide && !structSide) return "전략 탐험가" as const;
  if(!effSide && !structSide) return "무드 컬렉터" as const;
  return "휴식 설계자" as const;
}

/** 원본 논리의 핵심만 유지: 효율/무드/구조/탐험으로 4타입 */
export function finalizePrimary(profile: Profile, answers: number[], score: Score): PrimaryResult {
  // 원본에서 recoveryTol/moveTol/queueTol/waitTol 계산이 있는데,
  // MVP-0에서는 타입 판정에 핵심인 efficiency만 동일한 형태로 구성한다.
  const moveTol  = 1 - norm(score.MovePain, 7);
  const queueTol = 1 - norm(score.QueuePain, 7);
  const waitTol  = 1 - norm(score.WaitAvoid, 7);

  const efficiency = 1 - ((1-moveTol) * 0.40 + (1-queueTol) * 0.35 + (1-waitTol) * 0.25);
  const mood = norm(score.Mood, 7);
  const structure = norm(score.Structure, 7 + 7*0.6);
  const exploration = norm(score.Novelty, 7 + 7*0.4);

  const travelerType = decideType({efficiency, mood, structure, exploration});

  // raw 그대로 + norm은 0~1
  const scoreRaw: Record<string, number> = { ...score };
  const scoreNorm: Record<string, number> = {
    efficiency,
    mood,
    structure,
    exploration,
    relax: norm(score.Relaxation, 7 + 7*0.6),
    activity: norm(score.Activity, 7),
    recoveryNeed: norm(score.RecoveryNeed, 7),
    movePain: norm(score.MovePain, 7),
    queuePain: norm(score.QueuePain, 7),
    waitAvoid: norm(score.WaitAvoid, 7),
    budgetImportant: norm(score.BudgetImportant, 7),
    premiumOk: norm(score.PremiumOk, 7),
    food: norm(score.Food, 7),
    culture: norm(score.Culture, 7),
  };

  return { profile, answers, scoreRaw, scoreNorm, travelerType };
}
