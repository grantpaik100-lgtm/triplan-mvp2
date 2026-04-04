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
    let mounted = true;

    async function run() {
      try {
        const primaryRaw = sessionStorage.getItem("primaryResult");
        const secondaryRaw = sessionStorage.getItem("secondaryAnswers");

        const primaryResult = primaryRaw ? JSON.parse(primaryRaw) : {};
        const secondaryAnswers = secondaryRaw ? JSON.parse(secondaryRaw) : {};

        const res = await fetch("/api/generate-trip", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            primaryResult,
            secondaryAnswers,
          }),
        });

        if (!res.ok) {
          throw new Error("trip generation failed");
        }

        const data = await res.json();

        if (!mounted) return;
        setTripResult(data.result as TripPlanResult);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "unknown error");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    run();

    return () => {
      mounted = false;
    };
  }, []);

  const summary = useMemo(() => {
    if (!tripResult) return null;
    return toSummaryViewModel(tripResult);
  }, [tripResult]);

  if (loading) {
    return <div style={{ padding: 24 }}>일정을 생성하는 중...</div>;
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
