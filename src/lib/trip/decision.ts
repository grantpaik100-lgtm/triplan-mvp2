/**
 * TriPlan V3 — Decision Layer (MVP)
 *
 * Current Role:
 * - Planning 결과(DayPlan)를 받아 role별 DecisionOption 3개씩 생성하는 MVP Decision Layer.
 *
 * Target Role:
 * - 사용자에게 제시할 경험 후보를 role 기준으로 큐레이션하는 공식 decision 엔진.
 *
 * Chain:
 * - engine (post-planning, pre-UI)
 *
 * Inputs:
 * - DayPlan (planning.ts 출력)
 * - PlanningInput
 *
 * Outputs:
 * - DecisionReadyDayPlan (role별 최대 3개 후보 배열)
 *
 * Called From:
 * - (예정) engine.ts 또는 UI layer
 *
 * Side Effects:
 * - 없음 (pure function)
 *
 * Current Status:
 * - MVP
 *
 * Decision:
 * - keep
 *
 * Notes:
 * - planning.ts / scheduling.ts 를 전혀 수정하지 않는다.
 * - DayPlan을 read-only로 소비한다.
 * - score weight는 파일 내 DECISION_SCORE_WEIGHTS 상수에서 가져온다.
 *   (TODO: 이후 constants.ts 로 이동)
 * - explanation은 템플릿 기반 단순 생성 (MVP 단순화).
 * - feasibility는 timeBudget.isFeasible + priority 기반 판단.
 * - diversity는 themeCluster 기반: 최소 2개 서로 다른 cluster 보장,
 *   3번째 option만 중복 허용, 중복 시 differentiatorNote 포함.
 */

import type {
  DayPlan,
  FunctionalRole,
  PlannedExperience,
  PlanningInput,
  ThemeCluster,
} from "./types";

// ─── Decision-layer 전용 타입 ─────────────────────────────────────────────────
// types.ts에 존재하지 않으므로 이 파일 내에서 정의한다.
// 안정화 이후 types.ts 로 이동 고려.

/** Decision 후보를 분류하는 3개 role */
export type DecisionRole = "peak" | "recovery" | "support";

/** score 세부 breakdown */
export type DecisionScoreBreakdown = {
  /** planningScore 정규화값 (0~1) */
  planningBase: number;
  /** role에 대한 적합도 (0~1) */
  roleAlignment: number;
  /** fatigue 역보상 (0~1) */
  fatigueBalance: number;
  /** timeBudget 여유 기반 bonus (0~1) */
  timeFitBonus: number;
  /** weighted sum */
  total: number;
};

/** 템플릿 기반 설명 */
export type DecisionExplanation = {
  headline: string;
  tags: string[];
  /** 같은 themeCluster 중복일 때 차이 설명 */
  differentiatorNote?: string;
};

/** 단일 Decision 후보 */
export type DecisionOption = {
  experienceId: string;
  placeName: string;
  decisionRole: DecisionRole;
  score: number;
  scoreBreakdown: DecisionScoreBreakdown;
  explanation: DecisionExplanation;
  isFeasible: boolean;
  themeCluster?: ThemeCluster;
  functionalRole: FunctionalRole;
};

/** role별 최대 3개 후보 묶음 */
export type DecisionRoleOptions = {
  role: DecisionRole;
  /** feasible 후보만 포함, 최대 DECISION_OPTIONS_PER_ROLE(3)개 */
  options: DecisionOption[];
};

/** buildDecisionReadyDayPlan의 최종 출력 */
export type DecisionReadyDayPlan = {
  dayIndex: number;
  roleOptions: DecisionRoleOptions[];
  /** dayPlan.timeBudget.isFeasible 기반 */
  feasible: boolean;
  notes: string[];
};

// ─── Score weight 상수 ────────────────────────────────────────────────────────
// MVP에서는 이 파일 내에 정의.
// TODO: constants.ts로 이동 후 import로 교체.

const DECISION_SCORE_WEIGHTS = {
  planningBase: 0.5,
  roleAlignment: 0.3,
  fatigueBalance: 0.1,
  timeFitBonus: 0.1,
} as const;

/** role당 최대 후보 수 */
const DECISION_OPTIONS_PER_ROLE = 3;

/**
 * planningScore 정규화 기준값.
 * scoring.ts 로직상 현실적 최대값 추정 (empirical).
 * 정확한 상한이 필요하면 engine 단에서 max를 집계 후 주입 가능.
 */
const PLANNING_SCORE_NORM = 12;

// ─── Role classification ──────────────────────────────────────────────────────

/**
 * PlannedExperience → DecisionRole 분류.
 *
 * 우선순위:
 * 1. dayPlan.selection.items 의 role 필드 (planning 단계 마킹 우선)
 * 2. dayPlan.pins (structural pin 확인)
 * 3. functionalRole / fatigue / isMeal heuristic
 */
export function classifyDecisionRole(
  item: PlannedExperience,
  dayPlan: DayPlan,
): DecisionRole {
  const expId = item.experience.id;

  // 1. planning selection role 우선
  const selItem = dayPlan.selection?.items?.find(
    (s) => s.experienceId === expId,
  );
  if (selItem?.role === "peak_candidate") return "peak";
  if (selItem?.role === "recovery_candidate") return "recovery";

  // 2. structural pins 확인
  if (dayPlan.pins?.peak?.experienceId === expId) return "peak";
  if (dayPlan.pins?.recovery?.experienceId === expId) return "recovery";

  // 3. heuristic
  const fr = item.functionalRole;
  const exp = item.experience;

  if (fr === "rest" || fr === "transition_safe") return "recovery";
  if (exp.isMeal) return "recovery";
  if (fr === "anchor" || fr === "viewpoint") return "peak";
  if (exp.fatigue >= 4 && exp.priorityHints.canBeAnchor) return "peak";
  if (exp.fatigue <= 2) return "recovery";

  return "support";
}

// ─── Score components ─────────────────────────────────────────────────────────

/**
 * role에 대한 적합도(roleAlignment) 계산 (0~1).
 *
 * peak  : 높은 fatigue + canBeAnchor 선호, meal 패널티
 * recovery: 낮은 fatigue + rest/meal/quiet 선호
 * support : 중간 fatigue 친화
 */
function computeRoleAlignment(
  item: PlannedExperience,
  role: DecisionRole,
): number {
  const exp = item.experience;

  switch (role) {
    case "peak": {
      const fatigueBonus = (exp.fatigue - 1) / 4; // 0(fatigue=1) ~ 1(fatigue=5)
      const anchorBonus = exp.priorityHints.canBeAnchor ? 0.3 : 0;
      const mealPenalty = exp.isMeal ? 0.4 : 0;
      return clamp01(fatigueBonus + anchorBonus - mealPenalty);
    }
    case "recovery": {
      const fatigueInverse = 1 - (exp.fatigue - 1) / 4; // 높은 fatigue일수록 낮음
      const restBonus = exp.functionalRoleHints?.includes("rest") ? 0.3 : 0;
      const mealBonus = exp.isMeal ? 0.2 : 0;
      const quietBonus = exp.features.quiet >= 0.6 ? 0.2 : 0;
      // 합산 후 0~1 클램프
      return clamp01((fatigueInverse + restBonus + mealBonus + quietBonus) / 1.7);
    }
    case "support": {
      // 중간 fatigue(2~3)에서 최고점
      const midFatigue = 1 - Math.abs(exp.fatigue - 3) / 4;
      return clamp01(midFatigue * 0.7 + 0.3);
    }
  }
}

/**
 * fatigue balance 점수 (0~1).
 * role 기대 fatigue 대비 얼마나 잘 맞는지.
 */
function computeFatigueBalance(
  item: PlannedExperience,
  role: DecisionRole,
): number {
  const fatigue = item.experience.fatigue; // 1~5

  switch (role) {
    case "peak":
      return fatigue >= 3 ? 1.0 : 0.4;
    case "recovery":
      if (fatigue <= 2) return 1.0;
      if (fatigue <= 3) return 0.5;
      return 0.1;
    case "support":
      return fatigue <= 4 ? 0.8 : 0.3;
  }
}

/**
 * timeBudget 여유 기반 bonus (0~1).
 * isFeasible이 false면 0, true면 bufferMin 비율.
 */
function computeTimeFitBonus(dayPlan: DayPlan): number {
  const budget = dayPlan.timeBudget;
  if (!budget || !budget.isFeasible) return 0;
  const ratio = budget.bufferMin / Math.max(1, budget.availableMin);
  return clamp01(ratio);
}

// ─── Score entry point ────────────────────────────────────────────────────────

/**
 * DecisionScore 계산.
 * planningScore를 [0, PLANNING_SCORE_NORM] → [0, 1] 정규화 후 weighted sum.
 */
export function calculateDecisionScore(
  item: PlannedExperience,
  role: DecisionRole,
  dayPlan: DayPlan,
): DecisionScoreBreakdown {
  const planningBase = clamp01(item.planningScore / PLANNING_SCORE_NORM);
  const roleAlignment = computeRoleAlignment(item, role);
  const fatigueBalance = computeFatigueBalance(item, role);
  const timeFitBonus = computeTimeFitBonus(dayPlan);

  const total =
    planningBase * DECISION_SCORE_WEIGHTS.planningBase +
    roleAlignment * DECISION_SCORE_WEIGHTS.roleAlignment +
    fatigueBalance * DECISION_SCORE_WEIGHTS.fatigueBalance +
    timeFitBonus * DECISION_SCORE_WEIGHTS.timeFitBonus;

  return { planningBase, roleAlignment, fatigueBalance, timeFitBonus, total };
}

// ─── Explanation builder ──────────────────────────────────────────────────────

const ROLE_HEADLINES: Record<DecisionRole, (name: string) => string> = {
  peak: (name) => `${name} — 오늘의 하이라이트`,
  recovery: (name) => `${name} — 여유로운 전환`,
  support: (name) => `${name} — 흐름을 잇는 경험`,
};

function buildTagsFromItem(
  item: PlannedExperience,
  role: DecisionRole,
): string[] {
  const exp = item.experience;
  const tags: string[] = [];

  if (exp.priorityHints.canBeAnchor) tags.push("핵심 스팟");
  if (exp.isMeal) tags.push("식사");
  if (exp.isIndoor) tags.push("실내");
  if (exp.isNightFriendly) tags.push("야간 가능");
  if (exp.fatigue <= 2) tags.push("가벼운 피로도");
  if (exp.fatigue >= 4) tags.push("몰입형");
  if (exp.features.quiet >= 0.6) tags.push("조용함");
  if (exp.features.local >= 0.5) tags.push("로컬");
  if (exp.timeFlexibility === "low") tags.push("시간 민감");
  if (role === "peak" && exp.actionStrength >= 0.7) tags.push("강렬한 경험");
  if (role === "recovery" && exp.features.quiet >= 0.5) tags.push("회복형");

  return tags.slice(0, 4);
}

/**
 * 템플릿 기반 explanation 생성.
 * differentiatorNote는 같은 themeCluster 중복 시에만 포함.
 */
export function buildDecisionExplanation(
  item: PlannedExperience,
  role: DecisionRole,
  differentiatorNote?: string,
): DecisionExplanation {
  const base: DecisionExplanation = {
    headline: ROLE_HEADLINES[role](item.experience.placeName),
    tags: buildTagsFromItem(item, role),
  };

  if (differentiatorNote !== undefined && differentiatorNote.length > 0) {
    return { ...base, differentiatorNote };
  }

  return base;
}

// ─── Feasibility check ────────────────────────────────────────────────────────

/**
 * 개별 item feasibility 판단.
 *
 * MVP 기준:
 * - timeBudget overflow 시 optional item은 feasible하지 않음
 * - recommendedDuration이 availableMin의 50% 초과 시도 제외
 * - anchor / core는 budget 상태에 무관하게 feasible
 */
function isItemFeasible(item: PlannedExperience, dayPlan: DayPlan): boolean {
  const budget = dayPlan.timeBudget;
  if (!budget) return true;
  if (budget.isFeasible) return true;

  // overflow 상태에서 optional은 제외
  if (item.priority === "optional") return false;

  // overflow 상태에서 duration 비중이 너무 큰 경우도 제외
  const overThreshold =
    item.experience.recommendedDuration > budget.availableMin * 0.5;
  if (overThreshold) return false;

  return true;
}

// ─── Diversity policy ─────────────────────────────────────────────────────────

/**
 * differentiatorNote 생성 헬퍼.
 */
function buildDifferentiatorNote(
  opt: DecisionOption,
  existing: DecisionOption[],
): string {
  const sameCluster = existing.find((e) => e.themeCluster === opt.themeCluster);
  if (!sameCluster) return "";

  const roleDesc =
    opt.functionalRole === "rest"
      ? "더 가벼운 쉼을"
      : opt.functionalRole === "meal"
        ? "식사 역할을"
        : opt.functionalRole === "viewpoint"
          ? "다른 시야를"
          : "다른 관점을";

  return `${sameCluster.placeName}와 같은 유형이지만, ${opt.placeName}은(는) ${roleDesc} 제공합니다.`;
}

/**
 * Diversity 정책 적용.
 *
 * 규칙:
 * - 최소 2개는 서로 다른 themeCluster
 * - 3번째 option만 중복 cluster 허용
 * - 중복이면 explanation에 differentiatorNote 포함
 *
 * 입력: 점수 내림차순 정렬된 DecisionOption[]
 * 출력: 최대 DECISION_OPTIONS_PER_ROLE(3)개
 */
export function applyDecisionDiversityPolicy(
  options: DecisionOption[],
): DecisionOption[] {
  if (options.length <= 1) return options;

  const result: DecisionOption[] = [];
  const usedClusters = new Set<ThemeCluster | undefined>();
  const resultIds = new Set<string>();

  // 1단계: 다른 cluster 우선 채우기 (최대 2개)
  for (const opt of options) {
    if (result.length >= 2) break;
    if (!usedClusters.has(opt.themeCluster)) {
      usedClusters.add(opt.themeCluster);
      resultIds.add(opt.experienceId);
      result.push(opt);
    }
  }

  // 2단계: 3번째 슬롯 — 중복 cluster 허용, differentiatorNote 추가
  if (result.length < DECISION_OPTIONS_PER_ROLE) {
    for (const opt of options) {
      if (result.length >= DECISION_OPTIONS_PER_ROLE) break;
      if (resultIds.has(opt.experienceId)) continue;

      const isDuplicate = usedClusters.has(opt.themeCluster);
      const enriched: DecisionOption = isDuplicate
        ? {
            ...opt,
            explanation: {
              ...opt.explanation,
              differentiatorNote: buildDifferentiatorNote(opt, result),
            },
          }
        : opt;

      resultIds.add(enriched.experienceId);
      usedClusters.add(enriched.themeCluster);
      result.push(enriched);
    }
  }

  return result;
}

// ─── Role-level option builder ────────────────────────────────────────────────

/**
 * dayPlan의 모든 items에서 특정 role에 해당하는 feasible 후보를 추출하고
 * score 내림차순 정렬 후 diversity policy 적용 → 최대 3개 반환.
 *
 * PlanningInput은 향후 companion-aware scoring 확장을 위해 시그니처에 포함.
 * (MVP에서는 timeFitBonus 계산 시 dayPlan.timeBudget를 통해 간접 사용)
 */
export function buildDecisionOptionsForRole(
  dayPlan: DayPlan,
  role: DecisionRole,
  _input: PlanningInput,
): DecisionOption[] {
  const allItems: PlannedExperience[] = [
    ...dayPlan.anchor,
    ...dayPlan.core,
    ...dayPlan.optional,
  ];

  const candidates = allItems
    .filter((item) => classifyDecisionRole(item, dayPlan) === role)
    .filter((item) => isItemFeasible(item, dayPlan));

  if (candidates.length === 0) return [];

  const scored: DecisionOption[] = candidates.map((item) => {
    const scoreBreakdown = calculateDecisionScore(item, role, dayPlan);
    return {
      experienceId: item.experience.id,
      placeName: item.experience.placeName,
      decisionRole: role,
      score: scoreBreakdown.total,
      scoreBreakdown,
      explanation: buildDecisionExplanation(item, role),
      isFeasible: true,
      themeCluster: item.themeCluster,
      functionalRole: item.functionalRole,
    };
  });

  const sorted = [...scored].sort((a, b) => b.score - a.score);
  return applyDecisionDiversityPolicy(sorted);
}

// ─── Top-level entry point ────────────────────────────────────────────────────

/**
 * Planning 결과(DayPlan)를 받아 role별 DecisionOption 3개씩을 포함한
 * DecisionReadyDayPlan을 반환한다.
 *
 * - 기존 planning / scheduling은 전혀 건드리지 않는다.
 * - DayPlan을 read-only로 소비하는 pure function이다.
 * - engine.ts에서 scheduleDayPlan과 동일한 위치(post-planning)에 삽입 가능.
 */
export function buildDecisionReadyDayPlan(
  dayPlan: DayPlan,
  input: PlanningInput,
): DecisionReadyDayPlan {
  const roles: DecisionRole[] = ["peak", "recovery", "support"];
  const notes: string[] = [];

  const roleOptions: DecisionRoleOptions[] = roles.map((role) => {
    const options = buildDecisionOptionsForRole(dayPlan, role, input);
    notes.push(`${role}:candidates=${options.length}`);
    return { role, options };
  });

  const feasible = dayPlan.timeBudget?.isFeasible ?? true;
  if (!feasible) notes.push("timeBudget:infeasible");

  return {
    dayIndex: dayPlan.day,
    roleOptions,
    feasible,
    notes,
  };
}

// ─── 유틸리티 ─────────────────────────────────────────────────────────────────

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
