/**
 * TriPlan V3
 * Current Role:
 * - user preference / planning context와 experience metadata를 비교하여 candidate score를 계산하는 scoring module이다.
 *
 * Target Role:
 * - recommendation scoring의 공식 계산 계층으로 유지되어야 한다.
 *
 * Chain:
 * - engine
 *
 * Inputs:
 * - user vector / PlanningInput
 * - experience metadata
 *
 * Outputs:
 * - scored candidates / score breakdown
 *
 * Called From:
 * - src/lib/trip/planning.ts
 * - engine orchestration chain
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
 * - Experience Feature Space와 Recommendation Engine이 만나는 핵심 계산 파일이다.
 */

import type {
  ExperienceMetadata,
  PlanningInput,
  ScoredExperience,
  UserVector,
} from "./types";

function dotPreference(user: UserVector, exp: ExperienceMetadata): number {
  const f = exp.features;

  return (
    user.food * f.food +
    user.culture * f.culture +
    user.nature * f.nature +
    user.shopping * f.shopping +
    user.entertainment * f.entertainment +
    user.quiet * f.quiet +
    user.romantic * f.romantic +
    user.local * f.local +
    user.touristy * f.touristy +
    user.luxury * f.luxury +
    user.hipster * f.hipster +
    user.traditional * f.traditional +
    user.walkIntensity * f.walkIntensity +
    user.crowdLevel * f.crowdLevel +
    user.activityIntensity * f.activityIntensity +
    (1 - user.cost) * (5 - f.cost)
  );
}

function companionScore(
  exp: ExperienceMetadata,
  companionType: PlanningInput["companionType"],
): number {
  return exp.companionFit[companionType] ?? 0;
}

function timeScore(exp: ExperienceMetadata): number {
  if (exp.timeFlexibility === "low") return 1.5;
  if (exp.timeFlexibility === "medium") return 0.8;
  return 0.2;
}

function areaScore(exp: ExperienceMetadata, input: PlanningInput): number {
  if (input.preferredAreas?.includes(exp.area)) return 1.5;
  if (input.blockedAreas?.includes(exp.area)) return -3;
  return 0;
}

function anchorBonus(exp: ExperienceMetadata, input: PlanningInput): number {
  const must = input.mustExperienceIds?.includes(exp.id) ? 3 : 0;
  const anchor = exp.priorityHints.canBeAnchor ? 1.2 : 0;
  return must + anchor;
}

function penalty(exp: ExperienceMetadata): number {
  return exp.review.manualReview ? 0.5 : 0;
}

export function scoreExperience(
  user: UserVector,
  input: PlanningInput,
  experience: ExperienceMetadata,
): ScoredExperience {
  const preference = dotPreference(user, experience);
  const companion = companionScore(experience, input.companionType);
  const timeFit = timeScore(experience);
  const areaFit = areaScore(experience, input);
  const anchor = anchorBonus(experience, input);
  const rawPenalty = penalty(experience);

  const total = preference + companion + timeFit + areaFit + anchor - rawPenalty;

  return {
    experience,
    score: total,
    scoreBreakdown: {
      preference,
      companion,
      timeFit,
      areaFit,
      anchorBonus: anchor,
      penalty: rawPenalty,
    },
  };
}

export function scoreExperiences(
  user: UserVector,
  input: PlanningInput,
  experiences: ExperienceMetadata[],
): ScoredExperience[] {
  return experiences
    .map((exp) => scoreExperience(user, input, exp))
    .sort((a, b) => b.score - a.score);
}
