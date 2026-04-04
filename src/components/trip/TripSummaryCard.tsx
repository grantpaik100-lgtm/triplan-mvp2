"use client";

import type { TripPlanResult } from "@/lib/trip/viewModel";
import {
  COLORS,
  DENSITY,
  GLASS,
  RADIUS,
  SHADOW,
  SPACE,
  TYPE,
} from "@/lib/MOTION_TOKENS";

type Props = {
  result: TripSummaryViewModel;
};

function getPrimaryTypeLabel(result: TripPlanResult) {
  const p = result.userModel.primary;
  const items = [
    { label: "휴식", value: p.rest },
    { label: "효율", value: p.schedule },
    { label: "분위기", value: p.mood },
    { label: "탐험", value: p.strategy },
  ].sort((a, b) => b.value - a.value);

  return items[0]?.label ?? "균형";
}

function getCompanionLabel(companion: string | null) {
  if (companion === "friend") return "친구와 함께";
  if (companion === "family") return "가족과 함께";
  if (companion === "couple") return "연인과 함께";
  if (companion === "solo") return "혼자 여행";
  return "동행 정보 없음";
}

function getBudgetLabel(budgetLevel: number) {
  if (budgetLevel <= 2) return "예산 절약형";
  if (budgetLevel === 3) return "중간 예산";
  return "여유 예산";
}

export default function TripSummaryCard({ result }: Props) {
  const density = DENSITY.base;
  const { userModel, meta } = result;

  return (
    <section
      className="tp2-card"
      style={{
        padding: `${density.cardPadY}px ${density.cardPadX}px`,
        borderRadius: RADIUS.xl,
        background: GLASS.background,
        boxShadow: SHADOW.level2,
        border: GLASS.border,
        color: COLORS.text,
      }}
    >
      <div
        className="tp2-cardHeader"
        style={{ marginBottom: SPACE[18] }}
      >
        <div
          style={{
            fontSize: TYPE.caption.size,
            lineHeight: TYPE.caption.lineHeight,
            fontWeight: TYPE.caption.weight,
            color: COLORS.muted,
            marginBottom: SPACE[8],
          }}
        >
          Trip Result
        </div>

        <h1
          style={{
            margin: 0,
            fontSize: TYPE.h1.size,
            lineHeight: TYPE.h1.lineHeight,
            fontWeight: TYPE.h1.weight,
            color: COLORS.text,
          }}
        >
          {userModel.city} · {userModel.days}일 일정
        </h1>

        <p
          style={{
            marginTop: SPACE[12],
            marginBottom: 0,
            fontSize: TYPE.body.size,
            lineHeight: TYPE.body.lineHeight,
            fontWeight: TYPE.body.weight,
            color: COLORS.muted,
          }}
        >
          {getCompanionLabel(userModel.companion)} · 하루 {meta.places_per_day}곳 ·{" "}
          {getPrimaryTypeLabel(result)} 중심
        </p>
      </div>

      <div
        className="tp2-wrapChips"
        style={{ marginTop: 0, marginBottom: SPACE[16] }}
      >
        <span className="tp2-chip">{getBudgetLabel(userModel.constraints.budgetLevel)}</span>
        <span className="tp2-chip">pace {userModel.constraints.pace}</span>
        <span className="tp2-chip">density {userModel.constraints.dailyDensity}</span>
        <span className="tp2-chip">candidate {meta.candidate_count}</span>
      </div>

      <div
        className="tp2-subcard"
        style={{
          borderRadius: RADIUS.lg,
          boxShadow: SHADOW.level1,
        }}
      >
        <div
          style={{
            fontSize: TYPE.caption.size,
            lineHeight: TYPE.caption.lineHeight,
            fontWeight: TYPE.caption.weight,
            color: COLORS.muted,
            marginBottom: SPACE[8],
          }}
        >
          왜 이렇게 나왔는가
        </div>

        <div
          style={{
            fontSize: TYPE.body.size,
            lineHeight: TYPE.body.lineHeight,
            fontWeight: TYPE.body.weight,
            color: COLORS.text,
          }}
        >
          설문1의 기본 여행 성향과 설문2의 실제 제약을 함께 반영해, 하루 장소 수와
          이동 부담을 고려한 일정 초안을 만들었다.
        </div>
      </div>
    </section>
  );
}
