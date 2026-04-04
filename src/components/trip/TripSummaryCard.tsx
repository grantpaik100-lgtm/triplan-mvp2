"use client";

import type { TripSummaryViewModel } from "@/lib/trip/viewModel";
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
  summary: TripSummaryViewModel;
};

export default function TripSummaryCard({ summary }: Props) {
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
          {summary.days}일 일정
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
          총 {summary.totalDays}일 스케줄 · overflow {summary.overflowDays}일
        </p>
      </div>

      <div
        className="tp2-wrapChips"
        style={{ marginTop: 0, marginBottom: SPACE[16] }}
      >
        <span className="tp2-chip">repair {summary.totalRepairCount}</span>
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
          {summary.explanation}
        </div>
      </div>
    </section>
  );
}
