/**
 * TriPlan V3
 * Current Role:
 * - tripResult를 storage에서 읽고 viewModel을 거쳐 최종 결과 UI를 렌더링하는 결과 route file이다.
 *
 * Target Role:
 * - generated trip result의 공식 route-level renderer로 유지되어야 한다.
 *
 * Chain:
 * - result
 *
 * Inputs:
 * - sessionStorage trip result
 *
 * Outputs:
 * - result page rendering
 *
 * Called From:
 * - /trip/result route
 * - generate 완료 후 navigation
 *
 * Side Effects:
 * - sessionStorage read
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
 * - result rendering과 engine output contract가 만나는 경계 파일이다.
 */
"use client";

import { useEffect, useMemo, useState } from "react";
import TripSummaryCard from "@/components/trip/TripSummaryCard";
import TripDayCard from "@/components/trip/TripDayCard";
import type { TripPlanResult } from "@/lib/trip/types";
import {
  toSummaryViewModel,
  toDayCardViewModel,
} from "@/lib/trip/viewModel";

export default function TripResultPage() {
  const [loading, setLoading] = useState(true);
  const [tripResult, setTripResult] = useState<TripPlanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw =
        sessionStorage.getItem("tripResult") ??
        sessionStorage.getItem("triplan_trip_result");

      if (!raw) {
        setError("저장된 여행 결과가 없습니다.");
        setLoading(false);
        return;
      }

      const parsed = JSON.parse(raw) as TripPlanResult;
      setTripResult(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  const summary = useMemo(() => {
    if (!tripResult) return null;
    return toSummaryViewModel(tripResult);
  }, [tripResult]);

  if (loading) {
    return <div style={{ padding: 24 }}>결과를 불러오는 중...</div>;
  }

  if (error) {
    return <div style={{ padding: 24 }}>오류: {error}</div>;
  }

  if (!tripResult) {
    return <div style={{ padding: 24 }}>결과가 없습니다.</div>;
  }

  return (
    <main style={{ padding: 24 }}>
      {summary && <TripSummaryCard summary={summary} />}

      <div style={{ height: 24 }} />

      {tripResult.dayPlans.map((dayPlan, index) => {
        const schedule = tripResult.schedules[index];
        if (!schedule) return null;

        const dayCard = toDayCardViewModel(dayPlan, schedule);

        return (
          <div key={dayPlan.day} style={{ marginBottom: 24 }}>
            <TripDayCard dayPlan={dayCard} />
          </div>
        );
      })}
    </main>
  );
}
