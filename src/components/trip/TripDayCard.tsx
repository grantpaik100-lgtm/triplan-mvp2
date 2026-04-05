/**
 * TriPlan V3
 * Current Role:
 * - 하루 단위 계획을 렌더링하는 result day-level UI 컴포넌트다.
 *
 * Target Role:
 * - day plan rendering의 공식 component로 유지되어야 한다.
 *
 * Chain:
 * - result
 *
 * Inputs:
 * - single day plan view model
 *
 * Outputs:
 * - day card rendering
 *
 * Called From:
 * - app/trip/result/page.tsx
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
 * - scheduling 결과가 실제로 어떻게 보이는지를 보여주는 UI 경계다.
 */
"use client";

import type { DayCardViewModel } from "@/lib/trip/viewModel";
import {
  COLORS,
  DENSITY,
  GLASS,
  RADIUS,
  SHADOW,
  SPACE,
  TYPE,
} from "@/lib/MOTION_TOKENS";
import TripPlaceRow from "./TripPlaceRow";

type Props = {
  dayPlan: DayCardViewModel;
};

export default function TripDayCard({ dayPlan }: Props) {
  const density = DENSITY.base;

  return (
    <section
      className="tp2-card"
      style={{
        padding: `${density.cardPadY}px ${density.cardPadX}px`,
        borderRadius: RADIUS.xl,
        background: GLASS.background,
        boxShadow: SHADOW.level2,
        border: GLASS.border,
      }}
    >
      <div
        className="tp2-cardHeader"
        style={{ marginBottom: SPACE[16] }}
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
          Day {dayPlan.day}
        </div>

        <h2
          style={{
            margin: 0,
            fontSize: TYPE.h2.size,
            lineHeight: TYPE.h2.lineHeight,
            fontWeight: TYPE.h2.weight,
            color: COLORS.text,
          }}
        >
          {dayPlan.areaText}
        </h2>

        <p
          style={{
            marginTop: SPACE[10],
            marginBottom: 0,
            fontSize: TYPE.body.size,
            lineHeight: TYPE.body.lineHeight,
            fontWeight: TYPE.body.weight,
            color: COLORS.muted,
          }}
        >
          총 예상 시간 {dayPlan.estimatedMinutes}분
        </p>
      </div>

      <div
        className="tp2-wrapChips"
        style={{ marginTop: 0, marginBottom: SPACE[14] }}
      >
        <span className="tp2-chip">region {dayPlan.areaText}</span>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: density.rowGap,
        }}
      >
        {dayPlan.items.map((entry, index) => (
          <TripPlaceRow
            key={`${dayPlan.day}-${index}-${entry.placeName}`}
            entry={entry}
          />
        ))}
      </div>
    </section>
  );
}
