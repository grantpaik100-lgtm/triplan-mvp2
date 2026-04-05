/**
 * TriPlan V3
 * Current Role:
 * - followup에서 생성된 planningInput과 primaryResult를 읽고 trip generation API를 호출하는 generate entry page다.
 *
 * Target Role:
 * - planningInput 기반 trip generation 시작의 공식 route file로 유지되어야 한다.
 *
 * Chain:
 * - generate
 *
 * Inputs:
 * - sessionStorage.triplan_planning_input
 * - sessionStorage.triplan_primary_result
 *
 * Outputs:
 * - POST /api/generate-trip
 * - sessionStorage trip result 저장
 * - /trip/result 이동
 *
 * Called From:
 * - /trip/generate route
 * - followup 완료 후 navigation
 *
 * Side Effects:
 * - sessionStorage read/write
 * - fetch
 * - route navigation
 *
 * Current Status:
 * - canonical, but request payload canonicalization needed
 *
 * Decision:
 * - keep
 *
 * Move Target:
 * - 없음
 *
 * Notes:
 * - 현재 stored planningInput을 secondaryAnswers로 역변환하는 우회가 섞여 있다.
 * - 정리 후에는 planningInput direct handoff가 기준이 되어야 한다.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

function buildSecondaryAnswersFromStoredInput(stored: any) {
  const rawAnswers = stored?.raw?.surveyRawAnswers ?? {};

  return {
    ...rawAnswers,

    // normalizeInput.ts가 직접 읽는 핵심 키 보정
    tripDays: rawAnswers.tripDays,
    companionType:
      rawAnswers.companionType ??
      stored?.context?.companionDynamic ??
      rawAnswers.companion,

    firstDayStart: rawAnswers.firstDayStart,
    lastDayEnd: rawAnswers.lastDayEnd,

    // pace는 softPreferences에 들어가 있으므로 루트로 끌어올림
    pace: rawAnswers.pace ?? stored?.softPreferences?.pace,

    diversityMode: rawAnswers.diversityMode ?? rawAnswers.diversity_mode,
  };
}

export default function TripGeneratePage() {
  const router = useRouter();
  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    async function run() {
      try {
        const planningInputRaw = sessionStorage.getItem("triplan_planning_input");
        const primaryResultRaw = sessionStorage.getItem("triplan_primary_result");

        if (!planningInputRaw) {
          throw new Error("Missing triplan_planning_input in sessionStorage");
        }

        const storedPlanning = JSON.parse(planningInputRaw);
        const primaryResult = primaryResultRaw
          ? JSON.parse(primaryResultRaw)
          : undefined;

        const secondaryAnswers = buildSecondaryAnswersFromStoredInput(storedPlanning);

        const response = await fetch("/api/generate-trip", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            primaryResult,
            secondaryAnswers,
          }),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          throw new Error(data.error ?? "Failed to generate trip");
        }

        sessionStorage.setItem("triplan_trip_result", JSON.stringify(data.result));
        sessionStorage.setItem("tripResult", JSON.stringify(data.result));

        router.replace("/trip/result");
      } catch (e) {
        console.error("[trip/generate] failed:", e);
        setError(
          e instanceof Error ? e.message : "Failed to generate trip result",
        );
      }
    }

    void run();
  }, [router]);

  if (error) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
            Trip generation failed
          </div>
          <div style={{ opacity: 0.8 }}>{error}</div>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 12 }}>
          Generating your trip...
        </div>
      </div>
    </main>
  );
}
