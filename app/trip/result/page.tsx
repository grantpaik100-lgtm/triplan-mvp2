"use client";

import { useEffect, useState } from "react";

export default function TripResultPage() {
  const [loading, setLoading] = useState(true);
  const [tripResult, setTripResult] = useState<any>(null);
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

  if (loading) return <div>일정을 생성하는 중...</div>;
  if (error) return <div>오류: {error}</div>;
  if (!tripResult) return <div>결과가 없습니다.</div>;

  return (
    <div>
      <h1>여행 결과</h1>

      {tripResult.schedules?.map((day: any) => (
        <section key={day.day} style={{ marginBottom: 24 }}>
          <h2>Day {day.day}</h2>
          <ul>
            {day.items?.map((item: any) => (
              <li key={item.experienceId}>
                {item.placeName} ({item.startSlot} ~ {item.endSlot})
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
