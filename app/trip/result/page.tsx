"use client";

import { useEffect, useMemo, useState } from "react";

type ScheduledItem = {
  experienceId: string;
  placeName: string;
  startSlot: number;
  endSlot: number;
  durationMinutes: number;
  priority: "anchor" | "core" | "optional";
};

type DaySchedule = {
  day: number;
  items: ScheduledItem[];
  report: {
    isFeasible: boolean;
    issues: string[];
    totalFatigue: number;
    totalMinutes: number;
    activeMinutes: number;
    gapMinutes: number;
  };
};

type TripResult = {
  dayPlans: any[];
  schedules: DaySchedule[];
};

function slotToTimeString(slot: number): string {
  const totalMinutes = slot * 30;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export default function TripResultPage() {
  const [loading, setLoading] = useState(true);
  const [tripResult, setTripResult] = useState<TripResult | null>(null);
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
        setTripResult(data.result);
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

  const schedules = useMemo(() => tripResult?.schedules ?? [], [tripResult]);

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
      <h1 style={{ fontSize: 28, marginBottom: 24 }}>TriPlan 결과</h1>

      {schedules.map((day) => (
        <section
          key={day.day}
          style={{
            marginBottom: 32,
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>Day {day.day}</h2>

          <div style={{ marginBottom: 12, fontSize: 14, opacity: 0.8 }}>
  일정 범위: {day.report.totalMinutes}분 / 실제 활동: {day.report.activeMinutes}분 / 공백: {day.report.gapMinutes}분
  {" / "}
  피로도: {day.report.totalFatigue}
  {" / "}
  가능 여부: {day.report.isFeasible ? "가능" : "조정 필요"}
</div>

          {day.report.issues.length > 0 && (
            <div style={{ marginBottom: 12, color: "crimson", fontSize: 14 }}>
              이슈: {day.report.issues.join(", ")}
            </div>
          )}

          <ul style={{ paddingLeft: 20 }}>
  {day.items.map((item, index) => {
    const prev = index > 0 ? day.items[index - 1] : null;
    const gapMinutes = prev ? (item.startSlot - prev.endSlot) * 30 : 0;

    return (
      <div key={item.experienceId}>
        {gapMinutes > 0 && (
          <li style={{ marginBottom: 8, color: "#666" }}>
            자유시간 / 이동 / 여유시간 ({gapMinutes}분)
          </li>
        )}

        <li style={{ marginBottom: 10 }}>
          <strong>{item.placeName}</strong>{" "}
          ({slotToTimeString(item.startSlot)} ~ {slotToTimeString(item.endSlot)})
          {" · "}
          {item.durationMinutes}분
          {" · "}
          {item.priority}
        </li>
      </div>
    );
  })}
</ul>
        </section>
      ))}
    </main>
  );
}
