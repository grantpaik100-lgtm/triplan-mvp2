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
